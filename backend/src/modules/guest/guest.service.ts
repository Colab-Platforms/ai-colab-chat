import prisma from "@root/prisma.js";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import dayjs from "dayjs";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import {
  GUEST_LIMITS,
  GUEST_LIMIT_REACHED_CODE,
  GUEST_MODEL_EXTERNAL_IDS,
} from "./guest.config.js";

export type GuestTurnKind = "single" | "multi";

export class GuestLimitError extends Error {
  readonly code = GUEST_LIMIT_REACHED_CODE;
  constructor(message = "Free trial limit reached. Sign up to continue.") {
    super(message);
  }
}

const hashIp = (ip: string) =>
  createHash("sha256")
    .update(`${ip}:${process.env.JWT_SECRET ?? ""}`)
    .digest("hex");

/** Trial messages left, capped by what the IP's shared allowance still has. */
const getRemaining = (
  s: { singleUsed: number; multiUsed: number },
  ipUsed: number,
) => {
  const ipLeft = Math.max(0, GUEST_LIMITS.ipMessages - ipUsed);
  return {
    singleLeft: Math.min(ipLeft, Math.max(0, GUEST_LIMITS.singleMessages - s.singleUsed)),
    multiLeft: Math.min(ipLeft, Math.max(0, GUEST_LIMITS.multiMessages - s.multiUsed)),
  };
};

/** Messages already used by every guest token seen from this IP in the window. */
async function ipMessagesUsed(ipHash: string) {
  const since = dayjs().subtract(GUEST_LIMITS.ipWindowDays, "day").toDate();
  const agg = await prisma.guestSession.aggregate({
    where: { ipHash, createdAt: { gte: since } },
    _sum: { singleUsed: true, multiUsed: true },
  });
  return (agg._sum.singleUsed ?? 0) + (agg._sum.multiUsed ?? 0);
}

class GuestService {
  /** Creates the shadow user + session + wallet and returns a guest JWT. */
  async startSession(ip: string, userAgent?: string) {
    const ipHash = hashIp(ip);
    if ((await ipMessagesUsed(ipHash)) >= GUEST_LIMITS.ipMessages) {
      throw new GuestLimitError();
    }
    const sessionsToday = await prisma.guestSession.count({
      where: { ipHash, createdAt: { gte: dayjs().subtract(1, "day").toDate() } },
    });
    if (sessionsToday >= GUEST_LIMITS.ipSessionsPerDay) {
      throw new GuestLimitError("Too many guest sessions. Please sign up.");
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: "Guest",
          lastName: "",
          email: `guest_${randomUUID()}@guest.invalid`,
          // Not a bcrypt hash, so no password can ever match it.
          password: "!guest",
          isGuest: true,
          isVerified: true,
        },
      });
      await tx.guestSession.create({
        data: { userId: created.id, ipHash, userAgent: userAgent?.slice(0, 255) },
      });
      await tx.userWallet.create({
        data: { userId: created.id, tokensRemaining: GUEST_LIMITS.walletTokens },
      });
      return created;
    });

    const token = jwt.sign(
      { id: user.id, role: "GUEST", timezone: user.timezone },
      process.env.JWT_SECRET!,
      { expiresIn: GUEST_LIMITS.tokenExpiresIn },
    );
    return {
      token,
      ...getRemaining({ singleUsed: 0, multiUsed: 0 }, await ipMessagesUsed(ipHash)),
    };
  }

  async getStatus(userId: number) {
    const session = await prisma.guestSession.findUnique({ where: { userId } });
    if (!session) throw new ApiError("Guest session not found", STATUS_CODES.NOT_FOUND);
    return getRemaining(session, await ipMessagesUsed(session.ipHash));
  }

  /**
   * Atomically takes one trial slot. Throws GuestLimitError when the token's
   * quota or the IP's shared cap is exhausted.
   */
  async consume(userId: number, kind: GuestTurnKind) {
    const session = await prisma.guestSession.findUnique({ where: { userId } });
    if (!session || session.mergedIntoUserId) throw new GuestLimitError();

    if ((await ipMessagesUsed(session.ipHash)) >= GUEST_LIMITS.ipMessages) {
      throw new GuestLimitError();
    }

    const field = kind === "single" ? "singleUsed" : "multiUsed";
    const max =
      kind === "single" ? GUEST_LIMITS.singleMessages : GUEST_LIMITS.multiMessages;
    // The WHERE makes the check-and-increment atomic under concurrent requests.
    const { count } = await prisma.guestSession.updateMany({
      where: { userId, [field]: { lt: max } },
      data: { [field]: { increment: 1 } },
    });
    if (count === 0) throw new GuestLimitError();

    const updated = await prisma.guestSession.findUnique({ where: { userId } });
    return getRemaining(updated!, await ipMessagesUsed(session.ipHash));
  }

  /** Messages this IP's shared allowance still has (before any session exists). */
  async ipMessagesLeft(ip: string) {
    const used = await ipMessagesUsed(hashIp(ip));
    return Math.max(0, GUEST_LIMITS.ipMessages - used);
  }

  /** Active models guests may use, in the shape the model picker expects. */
  async listAllowedModels() {
    return prisma.model.findMany({
      where: {
        externalId: { in: [...GUEST_MODEL_EXTERNAL_IDS] },
        isActive: true,
        isDeleted: false,
      },
      include: { modelProvider: { select: { id: true, name: true } } },
    });
  }

  async isModelAllowed(externalId: string) {
    return GUEST_MODEL_EXTERNAL_IDS.includes(externalId);
  }

  /** Moves the guest's chats to the real account after signup/login. */
  async mergeInto(guestToken: string, realUserId: number) {
    let guestId: number;
    try {
      const decoded = jwt.verify(guestToken, process.env.JWT_SECRET!) as {
        id: number;
        role: string;
      };
      if (decoded.role !== "GUEST") throw new Error("not a guest token");
      guestId = decoded.id;
    } catch {
      throw new ApiError("Invalid guest token", STATUS_CODES.BAD_REQUEST);
    }

    const session = await prisma.guestSession.findUnique({
      where: { userId: guestId },
    });
    if (!session || session.mergedIntoUserId) return { movedChats: 0 };

    const movedChats = await prisma.$transaction(async (tx) => {
      const moved = await tx.chat.updateMany({
        where: { userId: guestId },
        data: { userId: realUserId },
      });
      await tx.guestSession.update({
        where: { userId: guestId },
        data: { mergedIntoUserId: realUserId },
      });
      // Soft-delete the shadow user. Its remaining rows (usage logs, wallet)
      // keep pointing at it; the user is just hidden from every listing.
      await tx.user.update({
        where: { id: guestId },
        data: { isDeleted: true, isActive: false, deletedAt: new Date() },
      });
      return moved.count;
    });
    return { movedChats };
  }
}

export default GuestService;

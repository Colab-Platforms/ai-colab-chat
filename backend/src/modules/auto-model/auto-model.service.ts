import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { getUserPlanContext } from "@/modules/plan-access/planAccess.service.js";
import { isModelAllowed } from "@/modules/org/org.policy.pure.js";
import { resolveCodeChatType } from "@/modules/code-workspace/code-workspace.chat.js";
import {
  classifyMessage,
  selectWithStickiness,
  type AutoCandidate,
  type AutoPriority,
  type Complexity,
} from "./auto-model.pure.js";

export interface ResolveAutoModelInput {
  content: string;
  chatId?: number | null;
  chatType?: string;
  attachmentIds?: number[];
}

export interface ResolveAutoModelResult {
  modelId: number;
  modelName: string;
  /** True when the chat moved off the model that answered the previous turn. */
  switched: boolean;
  previousModelId: number | null;
  complexity: Complexity;
  priority: AutoPriority;
  /** Short, user-facing explanation, shown when the model changes. */
  reason: string;
}

const PRIORITY_LABEL: Record<AutoPriority, string> = {
  ECONOMY: "Economy",
  BALANCED: "Balanced",
  QUALITY: "Best quality",
};

class AutoModelService {
  /**
   * Picks the model for ONE outgoing message. The result is only a model id:
   * the normal send path then validates, authorises and bills it exactly as if
   * the user had picked it by hand, so nothing here can bypass those checks.
   */
  async resolve(userId: number, input: ResolveAutoModelInput): Promise<ResolveAutoModelResult> {
    const [preference, planContext, wallet, attachments] = await Promise.all([
      prisma.userPreference.findUnique({ where: { userId } }),
      getUserPlanContext(userId),
      prisma.userWallet.findUnique({ where: { userId } }),
      input.attachmentIds?.length
        ? prisma.attachment.findMany({
            where: { id: { in: input.attachmentIds } },
            select: { mimeType: true },
          })
        : Promise.resolve([] as { mimeType: string }[]),
    ]);
    const priority = (preference?.autoModelPriority ?? "BALANCED") as AutoPriority;

    // Sticky state comes from the chat itself: the model that answered last.
    let currentId: number | null = null;
    let historyLength = 0;
    if (input.chatId) {
      const chat = await prisma.chat.findFirst({
        where: { id: input.chatId, userId, isDeleted: false },
        select: { id: true },
      });
      if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);

      const [count, lastResponse] = await Promise.all([
        prisma.message.count({ where: { chatId: chat.id, isDeleted: false } }),
        prisma.modelResponse.findFirst({
          where: {
            status: "COMPLETED",
            message: { chatId: chat.id, role: "ASSISTANT", isDeleted: false },
          },
          orderBy: { createdAt: "desc" },
          select: { modelId: true },
        }),
      ]);
      historyLength = count;
      currentId = lastResponse?.modelId ?? null;
    }

    const { complexity, needsVision } = classifyMessage({
      content: input.content,
      chatType: input.chatType,
      attachmentMimeTypes: attachments.map((a) => a.mimeType),
      historyLength,
    });

    // "CODE" (the code-workspace pill) is a STANDARD turn for model purposes.
    const capability = resolveCodeChatType(input.chatType).chatType || "STANDARD";
    const required = needsVision ? [capability, "VISION"] : [capability];

    const walletEmpty = !wallet || wallet.tokensRemaining <= 0;
    const org = planContext.org;
    const usable = (m: { id: number; isFreeModel: boolean; tokenMultiplier: number }) =>
      (!org || isModelAllowed(org, m.id)) && (!walletEmpty || m.isFreeModel || m.tokenMultiplier === 0);

    const scored = await prisma.model.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        autoQualityScore: { not: null },
        capabilities: { hasEvery: required as any },
      },
      select: {
        id: true,
        name: true,
        isFreeModel: true,
        tokenMultiplier: true,
        autoQualityScore: true,
      },
    });
    const candidates: AutoCandidate[] = scored
      .filter(usable)
      .map((m) => ({
        id: m.id,
        name: m.name,
        quality: m.autoQualityScore as number,
        cost: m.tokenMultiplier,
      }));

    const picked = selectWithStickiness({ candidates, currentId, priority, complexity });

    let chosen = picked.chosen;
    let outcome = picked.outcome;
    if (!chosen) {
      // No scored model fits (e.g. image generation, or nothing scored yet):
      // use the admin-designated default for this capability.
      const fallback = await this.fallbackModel(capability, required, usable);
      if (!fallback) {
        throw new ApiError("No model is available for Auto mode.", STATUS_CODES.NOT_FOUND);
      }
      chosen = { id: fallback.id, name: fallback.name, quality: 0, cost: fallback.tokenMultiplier };
      outcome = currentId === fallback.id ? "KEPT" : currentId == null ? "FRESH" : "SWITCHED";
    }

    console.log(
      `[auto-model] user=${userId} chat=${input.chatId ?? "new"} priority=${priority} complexity=${complexity} ` +
        `scored=${scored.length} candidates=${candidates.length} (${candidates.map((c) => `${c.name}:${c.quality}`).join(", ")}) ` +
        `current=${currentId ?? "none"} -> ${chosen.name} [${outcome}${picked.chosen ? "" : ", fallback default"}]`,
    );

    const switched = outcome === "SWITCHED";
    return {
      modelId: chosen.id,
      modelName: chosen.name,
      switched,
      previousModelId: currentId,
      complexity,
      priority,
      reason: await this.describe({
        outcome,
        chosenName: chosen.name,
        priority,
        complexity,
        needsVision,
        currentId,
        currentTooWeak: picked.currentTooWeak,
      }),
    };
  }

  private async fallbackModel(
    capability: string,
    required: string[],
    usable: (m: { id: number; isFreeModel: boolean; tokenMultiplier: number }) => boolean,
  ) {
    const defaults = await prisma.model.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        capabilities: { hasEvery: required as any },
        defaultForCapabilities: { has: capability as any },
      },
      select: { id: true, name: true, isFreeModel: true, tokenMultiplier: true },
      orderBy: { id: "asc" },
    });
    const preferred = defaults.find(usable);
    if (preferred) return preferred;

    const any = await prisma.model.findMany({
      where: { isActive: true, isDeleted: false, capabilities: { hasEvery: required as any } },
      select: { id: true, name: true, isFreeModel: true, tokenMultiplier: true },
      orderBy: { id: "asc" },
    });
    return any.find(usable) ?? null;
  }

  private async describe(args: {
    outcome: "KEPT" | "FRESH" | "SWITCHED";
    chosenName: string;
    priority: AutoPriority;
    complexity: Complexity;
    needsVision: boolean;
    currentId: number | null;
    currentTooWeak: boolean;
  }): Promise<string> {
    const { outcome, chosenName, priority, complexity, needsVision, currentId, currentTooWeak } = args;
    if (outcome === "FRESH") {
      return `${PRIORITY_LABEL[priority]} · ${complexity.toLowerCase()} request`;
    }
    if (outcome === "KEPT") return `Staying on ${chosenName} for consistency`;

    if (currentTooWeak) return `${chosenName} suits this request better`;
    if (needsVision && currentId != null) {
      const current = await prisma.model.findUnique({
        where: { id: currentId },
        select: { capabilities: true },
      });
      if (current && !current.capabilities.includes("VISION")) return "Image attached, so switched to a vision model";
    }
    return "Previous model isn't available right now";
  }
}

export default AutoModelService;

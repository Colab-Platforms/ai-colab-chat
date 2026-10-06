import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { assembleContext } from "./content.context.js";
import { reviseContent } from "./content.generator.js";
import { newTally, settleUsage } from "./content.meter.js";
import { FALLBACK_CONTENT_PERSONA } from "./content.persona.js";
import {
  isContentType,
  titleOf,
  validateBody,
  type ContentBody,
} from "./content.schemas.js";

const findOwned = async (userId: number, id: number) => {
  const item = await prisma.contentItem.findFirst({
    where: { id, userId, isDeleted: false },
  });
  if (!item) throw new ApiError("Content not found", STATUS_CODES.NOT_FOUND);
  return item;
};

export async function listItems(
  userId: number,
  q: { chatId?: number; folderId?: number; status?: string; limit?: number },
) {
  return prisma.contentItem.findMany({
    where: {
      userId,
      isDeleted: false,
      ...(q.chatId ? { chatId: q.chatId } : {}),
      ...(q.folderId ? { folderId: q.folderId } : {}),
      ...(q.status ? { status: q.status as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(q.limit ?? 50, 100),
  });
}

export async function getItem(userId: number, id: number) {
  const item = await findOwned(userId, id);
  const versions = await prisma.contentVersion.findMany({
    where: { contentItemId: id },
    orderBy: { version: "desc" },
    select: { version: true, title: true, source: true, note: true, createdAt: true },
  });
  return { ...item, versions };
}

/** A user edit never calls a model - it just validates and versions. */
export async function updateItem(
  userId: number,
  id: number,
  data: { body: unknown; title?: string },
  opts: { source?: "USER_EDIT"; note?: string } = {},
) {
  const item = await findOwned(userId, id);
  if (!isContentType(item.type)) {
    throw new ApiError("Unsupported content type", STATUS_CODES.BAD_REQUEST);
  }
  const { value, error } = validateBody(item.type, data.body);
  if (error || !value) {
    throw new ApiError(`Invalid content: ${error}`, STATUS_CODES.BAD_REQUEST);
  }

  const nextVersion = item.currentVersion + 1;
  const title = data.title?.trim() || titleOf(item.type, value);
  return prisma.$transaction(async (tx) => {
    await tx.contentVersion.create({
      data: {
        contentItemId: id,
        version: nextVersion,
        title,
        body: value as any,
        source: opts.source ?? "USER_EDIT",
        note: opts.note ?? null,
      },
    });
    return tx.contentItem.update({
      where: { id },
      data: {
        body: value as any,
        title,
        currentVersion: nextVersion,
        // Editing approved copy means it needs approving again.
        status: "READY",
        approvedAt: null,
      },
    });
  });
}

export async function restoreVersion(userId: number, id: number, version: number) {
  await findOwned(userId, id);
  const old = await prisma.contentVersion.findUnique({
    where: { contentItemId_version: { contentItemId: id, version } },
  });
  if (!old) throw new ApiError("Version not found", STATUS_CODES.NOT_FOUND);
  return updateItem(
    userId,
    id,
    { body: old.body, title: old.title },
    { note: `Restored v${version}` },
  );
}

export async function approveItem(userId: number, id: number) {
  await findOwned(userId, id);
  return prisma.contentItem.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
}

export async function deleteItem(userId: number, id: number) {
  await findOwned(userId, id);
  await prisma.contentItem.update({
    where: { id },
    data: { isDeleted: true },
  });
}

/** AI rewrite of an existing item ("shorten", "make it punchier", ...). */
export async function regenerateItem(
  userId: number,
  id: number,
  data: { instruction: string; modelId?: number },
) {
  const item = await findOwned(userId, id);
  if (!isContentType(item.type)) {
    throw new ApiError("Unsupported content type", STATUS_CODES.BAD_REQUEST);
  }

  const assistant = await prisma.assistant.findFirst({
    where: { kind: "CONTENT_AGENT", isActive: true, isDeleted: false },
  });
  const modelId = data.modelId ?? assistant?.defaultModelId;
  const model = await prisma.model.findFirst({
    where: modelId
      ? { id: modelId, isActive: true, isDeleted: false }
      : {
          defaultForCapabilities: { has: "STANDARD" },
          isActive: true,
          isDeleted: false,
        },
  });
  if (!model) {
    throw new ApiError("Model not found or inactive", STATUS_CODES.NOT_FOUND);
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId } });
  if ((!wallet || wallet.tokensRemaining <= 0) && !model.isFreeModel) {
    throw new ApiError("Token limit exceeded", STATUS_CODES.BAD_REQUEST);
  }

  const brief = (item.brief ?? {}) as Record<string, any>;
  const ctx = await assembleContext({
    userId,
    folderId: item.folderId,
    brief: {
      product: brief.product ?? null,
      platform: item.platform,
      topic: brief.topic ?? item.title,
      type: item.type,
    },
    queryText: data.instruction,
  });

  const tally = newTally();
  const body = await reviseContent({
    model: { externalId: model.externalId },
    persona: assistant?.systemPrompt ?? FALLBACK_CONTENT_PERSONA,
    temperature: Math.min(assistant?.temperature ?? 0.7, 0.9),
    type: item.type,
    platform: item.platform,
    existing: item.body as ContentBody,
    instruction: data.instruction,
    stableBlock: ctx.stableBlock,
    knowledgeBlock: ctx.knowledgeBlock,
    userContext: [],
    tally,
  });

  const nextVersion = item.currentVersion + 1;
  const title = titleOf(item.type, body);

  return prisma.$transaction(async (tx) => {
    await tx.contentVersion.create({
      data: {
        contentItemId: id,
        version: nextVersion,
        title,
        body: body as any,
        source: "REVISION",
        note: data.instruction.slice(0, 300),
      },
    });
    const updated = await tx.contentItem.update({
      where: { id },
      data: {
        body: body as any,
        title,
        currentVersion: nextVersion,
        status: "READY",
        approvedAt: null,
      },
    });
    // Billed here, inside the same transaction as the saved version.
    await settleUsage(tx, {
      userId,
      model,
      chatId: item.chatId,
      messageId: item.messageId,
      tally,
      referenceId: `content_regen_${id}_${nextVersion}`,
      reason: "CONTENT_REGENERATE",
    });
    return updated;
  });
}

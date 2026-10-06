import prisma from "@root/prisma.js";
import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";

const DISTILLATION_MODEL =
  process.env.DISTILLATION_MODEL || "anthropic/claude-haiku-4.5";

// Mirrors the per-folder cap enforced in context.service.ts for
// user-authored FOLDER contexts - auto-distilled ones share the same budget.
const MAX_FOLDER_CONTEXTS = 10;
const SUMMARY_TITLE = "Project Summary (auto)";
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 1000;
const MAX_FACTS_PER_RUN = 5;
// Mirrors context.validators.ts's `memory` cap (500 chars) - that Joi
// validator only guards the user-facing POST/PUT /contexts routes, and this
// service writes ContextMemory rows directly via Prisma, bypassing it. Kept
// equal to MAX_MEMORY_CHARS (not larger) so a user re-saving this row
// through the normal edit modal never trips the same cap enforced there.
const MAX_MEMORY_CHARS = 500;
const MAX_SUMMARY_CHARS = MAX_MEMORY_CHARS;
const MAX_TITLE_CHARS = 80;

interface DistilledFact {
  title: string;
  memory: string;
}

function buildPrompt(
  existingMemories: { title: string; memory: string }[],
  messages: { role: string; content: string }[],
) {
  const systemPrompt = [
    "You extract durable project knowledge from a conversation snippet.",
    "Only extract facts, decisions, or preferences that would still matter in a future, unrelated conversation about this same project - not small talk, not anything already covered.",
    "Do not repeat or rephrase anything already present in existingMemories.",
    'Respond with strict JSON: { "facts": [ { "title": string (max 6 words), "memory": string (max 2 sentences) } ] }.',
    "Return at most 3 facts. Return an empty array if nothing new and durable was said.",
  ].join(" ");

  const userContent = JSON.stringify({
    existingMemories: existingMemories.map((m) => ({
      title: m.title,
      memory: m.memory,
    })),
    conversation: messages.map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
    })),
  });

  return { systemPrompt, userContent };
}

function parseFacts(rawContent: string | null | undefined): DistilledFact[] {
  if (!rawContent) return [];

  // response_format: json_object is a request, not a guarantee - some
  // models (observed with the configured DISTILLATION_MODEL via OpenRouter)
  // still wrap the JSON in a markdown code fence. Strip it before parsing.
  const cleaned = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error(
      "[context-distillation] failed to parse LLM response as JSON:",
      error,
      "raw content:",
      rawContent,
    );
    return [];
  }

  const facts = Array.isArray(parsed?.facts) ? parsed.facts : [];
  return facts
    .filter(
      (f: any) =>
        f &&
        typeof f.title === "string" &&
        typeof f.memory === "string" &&
        f.title.trim() &&
        f.memory.trim(),
    )
    .slice(0, MAX_FACTS_PER_RUN)
    .map((f: any) => ({
      title: f.title.trim().slice(0, MAX_TITLE_CHARS),
      memory: f.memory.trim().slice(0, MAX_MEMORY_CHARS),
    }));
}

/**
 * Frees one slot in the folder's context budget by soft-deleting the
 * oldest auto-distilled (non-summary) memory. Never touches USER or
 * SYSTEM origin contexts.
 */
async function evictOldestDistilled(userId: number, folderId: number) {
  const oldest = await prisma.contextMemory.findFirst({
    where: {
      userId,
      folderId,
      type: "FOLDER",
      origin: "DISTILLED",
      isDeleted: false,
      title: { not: SUMMARY_TITLE },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (oldest) {
    await prisma.contextMemory.update({
      where: { id: oldest.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return true;
  }
  return false;
}

async function mergeIntoSummary(
  userId: number,
  folderId: number,
  chatId: number,
  facts: DistilledFact[],
  currentActiveCount: number,
) {
  const existingSummary = await prisma.contextMemory.findFirst({
    where: {
      userId,
      folderId,
      type: "FOLDER",
      origin: "DISTILLED",
      title: SUMMARY_TITLE,
      isDeleted: false,
    },
  });

  const newLines = facts.map((f) => `- ${f.title}: ${f.memory}`);

  if (existingSummary) {
    const existingLines = existingSummary.memory
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const dedupedNewLines = newLines.filter(
      (line) => !existingLines.includes(line),
    );
    const mergedLines = [...existingLines, ...dedupedNewLines].slice(
      -Math.floor(MAX_SUMMARY_CHARS / 40), // rough line budget, trimmed below by char cap too
    );
    let mergedMemory = mergedLines.join("\n");
    if (mergedMemory.length > MAX_SUMMARY_CHARS) {
      mergedMemory = mergedMemory.slice(mergedMemory.length - MAX_SUMMARY_CHARS);
    }

    await prisma.contextMemory.update({
      where: { id: existingSummary.id },
      data: { memory: mergedMemory, sourceChatId: chatId },
    });
    return;
  }

  // No summary row yet - make room for it if the folder is already at cap.
  if (currentActiveCount >= MAX_FOLDER_CONTEXTS) {
    const evicted = await evictOldestDistilled(userId, folderId);
    if (!evicted) {
      // Cap is filled entirely by the user's own contexts - never evict
      // those to make room for an auto-generated one. Drop this run's
      // facts instead of exceeding the folder's context budget.
      console.log(
        `[context-distillation] folder=${folderId} at cap with no distilled rows to evict - skipping summary creation`,
      );
      return;
    }
  }

  await prisma.contextMemory.create({
    data: {
      userId,
      folderId,
      type: "FOLDER",
      origin: "DISTILLED",
      isAutoSelected: true,
      sourceChatId: chatId,
      title: SUMMARY_TITLE,
      memory: newLines.join("\n"),
      priority: -1, // keep discrete, more specific facts sorted above the catch-all summary
    },
  });
}

export async function distillChatIntoFolderMemory(
  chatId: number,
  folderId: number,
): Promise<void> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, isDeleted: false },
    select: { userId: true, folderId: true },
  });
  if (!chat || chat.folderId !== folderId) return;

  const { userId } = chat;

  const lastDoneJob = await prisma.contextDistillationJob.findFirst({
    where: { chatId, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const since = lastDoneJob?.createdAt ?? new Date(0);

  const recentMessages = await prisma.message.findMany({
    where: { chatId, isDeleted: false, createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    take: MAX_MESSAGES,
    select: { role: true, content: true },
  });

  // Nothing new since the last run - skip the LLM call entirely.
  if (recentMessages.length === 0) return;

  const existingMemories = await prisma.contextMemory.findMany({
    where: { userId, folderId, type: "FOLDER", isDeleted: false },
    orderBy: { priority: "desc" },
    select: { id: true, title: true, memory: true },
  });

  const { systemPrompt, userContent } = buildPrompt(
    existingMemories,
    recentMessages.map((m) => ({ role: m.role.toLowerCase(), content: m.content })),
  );

  console.log(
    `[context-distillation] REQUEST → chat=${chatId} folder=${folderId} model=${DISTILLATION_MODEL}`,
    JSON.stringify(
      {
        systemPrompt,
        existingMemories,
        newMessages: recentMessages.length,
        userContent: JSON.parse(userContent),
      },
      null,
      2,
    ),
  );

  const completion = await createOpenRouterJsonCompletion({
    model: DISTILLATION_MODEL,
    systemPrompt,
    userContent,
  });

  const rawContent = completion.choices?.[0]?.message?.content;

  // Internal system call - not charged against the user's token wallet or
  // logged via UsageLog, since that table's modelId is a hard FK into the
  // user-facing Model catalog and this model isn't (deliberately) part of
  // it. If real cost tracking for this job becomes a priority, that's a
  // follow-up (either a dedicated system Model row, or a separate table).
  console.log(
    `[context-distillation] RESPONSE ← chat=${chatId} folder=${folderId} usage=${JSON.stringify(completion.usage)} content=`,
    rawContent,
  );

  const facts = parseFacts(rawContent);
  console.log(
    `[context-distillation] PARSED FACTS ← chat=${chatId} folder=${folderId}:`,
    facts,
  );
  if (facts.length === 0) return;

  const currentCount = existingMemories.length;
  const availableSlots = Math.max(MAX_FOLDER_CONTEXTS - currentCount, 0);
  const discreteFacts = facts.slice(0, availableSlots);
  const remainderFacts = facts.slice(discreteFacts.length);

  await prisma.$transaction(async (tx) => {
    for (const fact of discreteFacts) {
      await tx.contextMemory.create({
        data: {
          userId,
          folderId,
          type: "FOLDER",
          origin: "DISTILLED",
          isAutoSelected: true,
          sourceChatId: chatId,
          title: fact.title,
          memory: fact.memory,
        },
      });
    }
  });

  if (remainderFacts.length > 0) {
    await mergeIntoSummary(
      userId,
      folderId,
      chatId,
      remainderFacts,
      currentCount + discreteFacts.length,
    );
  }
}

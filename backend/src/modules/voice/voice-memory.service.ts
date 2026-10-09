import prisma from "@root/prisma.js";
import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";

const DISTILLATION_MODEL =
  process.env.DISTILLATION_MODEL || "anthropic/claude-haiku-4.5";

// type: "CUSTOM" (never GLOBAL) is deliberate — GLOBAL contexts are
// auto-linked to every new chat regardless of capability, which would leak
// this voice-only summary into ordinary text chats. Voice chats get it
// explicitly linked instead (see voice.service.ts createSession), so a
// CUSTOM row that's simply never auto-selected is exactly the right shape.
const VOICE_SUMMARY_TITLE = "Voice Chat Memory (auto)";
const CHATS_TO_SUMMARISE = 2;
const MAX_MESSAGES_PER_CHAT = 30;
const MAX_MESSAGE_CHARS = 500;
const MAX_BULLETS = 5;
const MAX_MEMORY_CHARS = 500;

interface SummaryBullet {
  text: string;
}

function buildPrompt(
  chats: { title: string | null; messages: { role: string; content: string }[] }[],
) {
  const systemPrompt = [
    "You summarise a user's recent voice conversations with their AI assistant into a short",
    "briefing the assistant can silently recall at the start of the next call — like notes a",
    "personal assistant would jot down, not a transcript.",
    "Write at most",
    String(MAX_BULLETS),
    "bullet points. Each bullet is one short sentence: what the user was doing, building, or",
    "asked about, and where things were left off. Skip greetings and small talk entirely.",
    'Respond with strict JSON: { "bullets": [ { "text": string (max 100 chars) } ] }.',
    "Return an empty array if nothing substantive happened in these conversations.",
  ].join(" ");

  const userContent = JSON.stringify({
    conversations: chats.map((c) => ({
      title: c.title,
      messages: c.messages.map((m) => ({
        role: m.role.toLowerCase(),
        content: m.content.slice(0, MAX_MESSAGE_CHARS),
      })),
    })),
  });

  return { systemPrompt, userContent };
}

function parseBullets(rawContent: string | null | undefined): SummaryBullet[] {
  if (!rawContent) return [];

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
      "[voice-memory] failed to parse LLM response as JSON:",
      error,
      "raw content:",
      rawContent,
    );
    return [];
  }

  const bullets = Array.isArray(parsed?.bullets) ? parsed.bullets : [];
  return bullets
    .filter((b: any) => b && typeof b.text === "string" && b.text.trim())
    .slice(0, MAX_BULLETS)
    .map((b: any) => ({ text: b.text.trim() }));
}

/** Looks up this user's voice-memory summary row, if the nightly cron has
 * ever produced one. Returns null (not an empty row) when there's nothing
 * yet — a brand-new user with no history simply gets no memory linked. */
export async function findVoiceSummaryContext(userId: number) {
  return prisma.contextMemory.findFirst({
    where: {
      userId,
      type: "CUSTOM",
      origin: "DISTILLED",
      title: VOICE_SUMMARY_TITLE,
      isDeleted: false,
    },
    select: { id: true },
  });
}

/** Regenerates (replaces, never appends) one user's voice-memory summary
 * from their last two voice chats. Called nightly — see
 * crons/voiceMemorySummary.ts. */
export async function generateVoiceMemorySummaryForUser(userId: number): Promise<void> {
  const recentChats = await prisma.chat.findMany({
    where: { userId, capability: "VOICE", isDeleted: false },
    orderBy: { updatedAt: "desc" },
    take: CHATS_TO_SUMMARISE,
    select: { id: true, title: true },
  });

  if (recentChats.length === 0) return;

  const chatsWithMessages = await Promise.all(
    recentChats.map(async (chat) => {
      const messages = await prisma.message.findMany({
        where: { chatId: chat.id, isDeleted: false },
        orderBy: { createdAt: "asc" },
        take: MAX_MESSAGES_PER_CHAT,
        select: { role: true, content: true },
      });
      return { title: chat.title, messages };
    }),
  );

  const hasAnyMessages = chatsWithMessages.some((c) => c.messages.length > 0);
  if (!hasAnyMessages) return;

  const { systemPrompt, userContent } = buildPrompt(chatsWithMessages);

  const completion = await createOpenRouterJsonCompletion({
    model: DISTILLATION_MODEL,
    systemPrompt,
    userContent,
  });

  const rawContent = completion.choices?.[0]?.message?.content;
  const bullets = parseBullets(rawContent);
  if (bullets.length === 0) return;

  let memory = bullets.map((b) => `- ${b.text}`).join("\n");
  if (memory.length > MAX_MEMORY_CHARS) {
    memory = memory.slice(0, MAX_MEMORY_CHARS);
  }

  const existing = await findVoiceSummaryContext(userId);
  if (existing) {
    await prisma.contextMemory.update({
      where: { id: existing.id },
      data: { memory, sourceChatId: recentChats[0].id },
    });
  } else {
    await prisma.contextMemory.create({
      data: {
        userId,
        type: "CUSTOM",
        origin: "DISTILLED",
        isAutoSelected: false,
        sourceChatId: recentChats[0].id,
        title: VOICE_SUMMARY_TITLE,
        memory,
      },
    });
  }
}

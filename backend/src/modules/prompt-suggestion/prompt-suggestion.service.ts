import { randomUUID } from "node:crypto";
import prisma from "@root/prisma.js";
import { createOpenRouterJsonCompletion } from "@/utils/openrouter.js";

const SUGGESTION_MODEL =
  process.env.SUGGESTION_MODEL || "anthropic/claude-haiku-4.5";

const BATCH_SIZE = 10;
const MIN_TEXT_CHARS = 15;
const MAX_TEXT_CHARS = 90;
const REFRESH_AFTER_HOURS = 44;
const AVOID_REPEATS_OF = 30;

function parseSuggestions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error("[prompt-suggestions] bad JSON from LLM:", error, raw);
    return [];
  }

  const items = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const text = item.trim().replace(/^["'\-\d.\s]+/, "").trim();
    if (!text || text.length < MIN_TEXT_CHARS || text.length > MAX_TEXT_CHARS) continue;
    // Drop fragments and anything that isn't plain text (links, markup, emoji).
    if (text.split(/\s+/).length < 3) continue;
    if (/https?:\/\/|www\.|[<>{}[\]`]|\p{Extended_Pictographic}/u.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.slice(0, BATCH_SIZE);
}

class PromptSuggestionService {
  /** Newest suggestions first, capped at one batch worth. */
  async latest() {
    return prisma.promptSuggestion.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BATCH_SIZE,
      select: { id: true, text: true },
    });
  }

  /** True when there's no batch yet, or the newest one is due for replacement. */
  async isDue() {
    const newest = await prisma.promptSuggestion.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!newest) return true;
    const ageHours = (Date.now() - newest.createdAt.getTime()) / 3_600_000;
    return ageHours >= REFRESH_AFTER_HOURS;
  }

  /** Asks the LLM for a fresh batch and stores it. Returns how many rows were saved. */
  async generateBatch() {
    const recent = await prisma.promptSuggestion.findMany({
      orderBy: { createdAt: "desc" },
      take: AVOID_REPEATS_OF,
      select: { text: true },
    });

    const systemPrompt = [
      `Write ${BATCH_SIZE} example prompts a user might type into an AI assistant that can chat,`,
      "search the web, and generate documents (PDF, PPT, DOCX, Excel), images and videos.",
      "Each prompt is one short, natural sentence (max 30 characters) written as the user's request,",
      "starting with a verb or a question word, with no quotes, emojis or numbering.",
      "Use this mix:",
      "3-4 prompts asking the AI to explain a specific subject, topic, concept or the logic behind",
      "something (e.g. how binary search works, why the sky is blue, how compound interest works);",
      "2-3 prompts asking it to generate a document or file with a concrete subject",
      "(a PDF report, PPT deck, Word/DOCX document or Excel sheet);",
      "1-2 prompts asking it to create an image or a short video of a concrete scene or product;",
      "1-2 prompts asking it to summarize something (an article, a PDF, meeting notes, a chapter).",
      "Rules: every prompt must be a task an AI model can complete from text alone, with no live data,",
      "no personal or private data, and no real named people, companies or events.",
      "Never state a fact that might be wrong or presuppose a false premise; ask about well-established",
      "subjects only. Nothing harmful, illegal, medical or legal advice, political, adult or controversial.",
      "Be specific and concrete, not vague. Do not reuse or closely paraphrase any prompt in the avoid list.",
      `Respond with strict JSON: { "suggestions": string[] } containing exactly ${BATCH_SIZE} items.`,
    ].join(" ");

    const completion = await createOpenRouterJsonCompletion({
      model: SUGGESTION_MODEL,
      systemPrompt,
      userContent: JSON.stringify({
        avoid: recent.map((r) => r.text),
        today: new Date().toISOString().slice(0, 10),
      }),
      max_tokens: 700,
      temperature: 0.9,
    });

    const suggestions = parseSuggestions(completion.choices?.[0]?.message?.content);
    if (suggestions.length === 0) return 0;

    // One createdAt per batch so "latest 10" returns a coherent set.
    const batchId = randomUUID();
    const createdAt = new Date();
    await prisma.promptSuggestion.createMany({
      data: suggestions.map((text) => ({ text, batchId, createdAt })),
    });
    return suggestions.length;
  }

  /** Cron entry point: generate only if the current batch is stale. */
  async refreshIfDue() {
    if (!(await this.isDue())) return 0;
    return this.generateBatch();
  }
}

export default PromptSuggestionService;

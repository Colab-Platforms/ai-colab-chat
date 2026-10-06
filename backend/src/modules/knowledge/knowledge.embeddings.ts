import OpenAI from "openai";

/**
 * Embedding client. Prefers OpenAI directly (OPENAI_API_KEY); otherwise routes
 * through OpenRouter, which the platform already pays for. Read per call, not at
 * module load, so a misconfigured env fails the job (and retries) instead of
 * crashing boot.
 */
export const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = Number(process.env.KNOWLEDGE_EMBED_BATCH ?? 64);

interface EmbeddingConfig {
  client: OpenAI;
  model: string;
}

const getConfig = (): EmbeddingConfig => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    };
  }
  const routerKey = process.env.OPENROUTER_API_KEY;
  if (!routerKey) {
    throw new Error("No embedding key configured (OPENAI_API_KEY or OPENROUTER_API_KEY)");
  }
  return {
    client: new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: routerKey,
      defaultHeaders: {
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:3000",
        "X-Title": "AI Colab Chat",
      },
    }),
    model: process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
  };
};

export const getEmbeddingModelName = (): string => getConfig().model;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { client, model } = getConfig();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model,
      input: batch,
      // Only the -3-large family needs shrinking to fit the vector(1536) column.
      ...(model.includes("3-large") ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
    });
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding model returned ${item.embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
        );
      }
      out.push(item.embedding);
    }
  }
  return out;
}

/** pgvector text literal: "[0.1,0.2,...]" */
export const toVectorLiteral = (vector: number[]): string =>
  `[${vector.join(",")}]`;

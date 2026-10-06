import prisma from "@root/prisma.js";
import {
  formatKnowledgeBlock,
  retrieveKnowledge,
} from "@/modules/knowledge/knowledge.service.js";
import type { ContentBrief } from "./content.brief.js";

/**
 * Step 2: assemble what the writer knows about this brand.
 *
 * Two layers, deliberately different:
 *  - BrandKit + Product are small, exact and ALWAYS included (never chunked or
 *    retrieved - a pricing figure must not depend on a similarity score).
 *  - Knowledge is retrieved per request (past posts, docs, research).
 *
 * The first layer is stable across a batch, so it goes in the cacheable system
 * block; the retrieved block changes per request and is kept separate.
 */

export interface AssembledContext {
  /** Brand kit + products. Stable → cacheable. */
  stableBlock: string;
  /** Retrieved knowledge. Varies per request. */
  knowledgeBlock: string;
  stats: {
    brandKit: boolean;
    products: number;
    knowledgeChunks: number;
    knowledgeError?: string;
  };
}

const list = (items: unknown): string[] =>
  Array.isArray(items) ? items.map(String).filter(Boolean) : [];

const nameMatches = (productName: string, wanted: string) => {
  const a = productName.toLowerCase();
  const b = wanted.toLowerCase();
  return a.includes(b) || b.includes(a);
};

export async function assembleContext(params: {
  userId: number;
  folderId: number | null;
  brief: Pick<ContentBrief, "product" | "platform" | "topic" | "type">;
  queryText: string;
}): Promise<AssembledContext> {
  const { userId, folderId, brief } = params;
  const scope = {
    userId,
    isDeleted: false,
    OR: folderId ? [{ folderId }, { folderId: null }] : [{ folderId: null }],
  };

  const [brandKits, products] = await Promise.all([
    prisma.brandKit.findMany({ where: scope, orderBy: { updatedAt: "desc" } }),
    prisma.product.findMany({
      where: scope,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  // A project-specific kit beats the user-global one.
  const kit =
    brandKits.find((k) => folderId && k.folderId === folderId) ??
    brandKits[0] ??
    null;

  const parts: string[] = [];

  if (kit) {
    const lines = [
      `<brand_kit name="${kit.name}">`,
      kit.voice && `Voice: ${kit.voice}`,
      kit.audience && `Audience: ${kit.audience}`,
      kit.ctaRules && `CTA rules: ${kit.ctaRules}`,
      kit.bannedWords.length &&
        `Never use these words/phrases: ${kit.bannedWords.join(", ")}`,
      kit.mustInclude.length &&
        `Always include: ${kit.mustInclude.join(", ")}`,
    ].filter(Boolean) as string[];
    const examples = list(kit.examples);
    if (examples.length) {
      lines.push(
        "Examples of on-brand writing:",
        ...examples.slice(0, 3).map((e, i) => `  ${i + 1}. ${e}`),
      );
    }
    lines.push("</brand_kit>");
    parts.push(lines.join("\n"));
  }

  const matched = brief.product
    ? products.filter((p) => nameMatches(p.name, brief.product!))
    : [];
  const included = matched.length
    ? matched
    : products.length <= 3
      ? products
      : [];

  for (const p of included) {
    const lines = [
      `<product name="${p.name}">`,
      p.summary && `Summary: ${p.summary}`,
      list(p.features).length && `Features: ${list(p.features).join("; ")}`,
      p.pricing && `Pricing: ${p.pricing}`,
      list(p.claimsAllowed).length &&
        `Approved claims: ${list(p.claimsAllowed).join("; ")}`,
      list(p.claimsForbidden).length &&
        `Claims you must NOT make: ${list(p.claimsForbidden).join("; ")}`,
      "</product>",
    ].filter(Boolean) as string[];
    parts.push(lines.join("\n"));
  }
  if (!included.length && products.length > 3) {
    parts.push(
      `Other products on file (ask or infer which is meant): ${products.map((p) => p.name).join(", ")}`,
    );
  }

  const stats: AssembledContext["stats"] = {
    brandKit: Boolean(kit),
    products: included.length,
    knowledgeChunks: 0,
  };

  // Retrieval must never be able to break a generation: no embedding key, an
  // empty library or a DB hiccup all degrade to "write without knowledge".
  let knowledgeBlock = "";
  try {
    const query = [brief.topic, brief.product, brief.platform, params.queryText]
      .filter(Boolean)
      .join(" ")
      .slice(0, 800);

    const [general, posts] = await Promise.all([
      retrieveKnowledge({
        userId,
        folderId,
        query,
        k: 6,
        types: ["DOCUMENT", "PRODUCT_DOC", "NOTE", "COMPETITOR"],
      }),
      retrieveKnowledge({
        userId,
        folderId,
        query,
        k: 3,
        types: ["PAST_POST"],
        ...(brief.platform ? { metadata: { platform: brief.platform } } : {}),
      }),
    ]);
    const chunks = [...general, ...posts];
    stats.knowledgeChunks = chunks.length;
    knowledgeBlock = formatKnowledgeBlock(chunks);
  } catch (error: any) {
    stats.knowledgeError = String(error?.message ?? error).slice(0, 200);
    console.error("[content-agent] knowledge retrieval failed:", error);
  }

  return { stableBlock: parts.join("\n\n"), knowledgeBlock, stats };
}

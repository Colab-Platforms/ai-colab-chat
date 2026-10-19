import { randomBytes } from "node:crypto";
import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { debitTokens } from "@/utils/walletUtils.js";
import {
  createOpenRouterChatCompletion,
  createOpenRouterJsonCompletion,
} from "@/utils/openrouter.js";
import {
  assertCanGenerateDocument,
  getUserPlanContext,
} from "@/modules/plan-access/planAccess.service.js";
import { dlog, dlogBlock, dlogError } from "./document.logger.js";
import { validateMindmapSpec } from "./document.validators.js";
import {
  MAX_MINDMAP_CHILDREN,
  MAX_MINDMAP_DEPTH,
  MAX_MINDMAP_NODES,
  type MindmapNode,
  type MindmapSpec,
} from "./document.types.js";

/**
 * The two AI actions on a stored mind map: expanding a node and asking about
 * the map. Both operate on the STORED spec (the client flushes its autosave
 * first) and both bill the caller's token wallet for the real usage, the same
 * way generation does.
 *
 * Expanding returns new branches for the CLIENT to apply as an ordinary,
 * undoable edit, rather than writing them itself: the editor owns the tree and
 * its single save path, so a second writer here would race the autosave.
 */

// Read per call, not captured at load (see document.spec.service.ts).
const getModel = () =>
  process.env.MINDMAP_AI_MODEL ??
  process.env.DOCUMENT_SPEC_MODEL ??
  "google/gemini-2.5-flash";

const EXPAND_MAX_TOKENS = 2000;
const ASK_MAX_TOKENS = 1000;

/** Levels of new branches an expansion may add, however much depth is free. */
const EXPAND_MAX_LEVELS = 2;
const EXPAND_MAX_NEW_CHILDREN = 6;

/** Outline fed to the "ask" model; a map within the node caps fits, a pathological one is cut. */
const OUTLINE_MAX_CHARS = 24_000;
const HISTORY_MAX_MESSAGES = 6;
const HISTORY_MAX_CHARS = 1500;
export const ASK_MAX_QUESTION_CHARS = 1000;
export const EXPAND_MAX_INSTRUCTION_CHARS = 500;

/* ------------------------------------------------------------------ *
 * Shared
 * ------------------------------------------------------------------ */

interface LoadedMap {
  id: number;
  title: string;
  spec: MindmapSpec;
}

/** The caller's stored map, or the reason they cannot use it. */
const loadMap = async (userId: number, id: number): Promise<LoadedMap> => {
  const document = await prisma.generatedDocument.findFirst({
    where: { id, userId, isDeleted: false },
    select: { id: true, format: true, status: true, spec: true, title: true },
  });

  if (!document) {
    throw new ApiError("Document not found", STATUS_CODES.NOT_FOUND);
  }
  if (document.format !== "MINDMAP" || !document.spec) {
    throw new ApiError(
      "This action is only available on mind maps.",
      STATUS_CODES.BAD_REQUEST,
    );
  }
  if (document.status === "PENDING" || document.status === "PROCESSING") {
    throw new ApiError(
      "This mind map is still updating. Try again in a moment.",
      STATUS_CODES.CONFLICT,
    );
  }
  return {
    id: document.id,
    title: document.title,
    spec: document.spec as unknown as MindmapSpec,
  };
};

/** Plan and wallet checks, done BEFORE spending anything on a model call. */
const assertCanSpend = async (userId: number) => {
  assertCanGenerateDocument(await getUserPlanContext(userId));

  const wallet = await prisma.userWallet.findUnique({ where: { userId } });
  if (!wallet || wallet.tokensRemaining <= 0) {
    throw new ApiError(
      "You're out of tokens. Upgrade your plan or wait for your next renewal to use AI on your mind map.",
      STATUS_CODES.BAD_REQUEST,
    );
  }
};

/**
 * Bills the real token usage of one completed call.
 *
 * Charged even when the output turns out unusable, because the provider has
 * already billed us for it; not charged when the call itself threw. Never
 * throws: failing to record a debit must not discard an answer the user is
 * waiting for.
 */
const charge = async (
  userId: number,
  documentId: number,
  reason: "MINDMAP_EXPAND" | "MINDMAP_ASK",
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
): Promise<number> => {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const total = promptTokens + completionTokens;
  if (total <= 0) return 0;

  try {
    const wallet = await prisma.userWallet.findUnique({ where: { userId } });
    if (!wallet) {
      dlogError("mindmap-ai", `user=${userId} has no wallet, skipping debit`, null);
      return total;
    }
    await prisma.$transaction((tx) =>
      debitTokens(tx, {
        userId,
        walletId: wallet.id,
        amount: total,
        referenceId: `${reason.toLowerCase()}_${documentId}_${Date.now()}`,
        meta: { reason, documentId, promptTokens, completionTokens },
      }),
    );
  } catch (error) {
    dlogError("mindmap-ai", `debit failed for document=${documentId}`, error);
  }
  return total;
};

const parseJsonLoosely = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("Model did not return parseable JSON");
    }
    return JSON.parse(raw.slice(start, end + 1));
  }
};

interface Located {
  node: MindmapNode;
  depth: number;
  /** Node texts from the root down to and including this node. */
  path: string[];
}

export const locate = (spec: MindmapSpec, id: string): Located | null => {
  const walk = (node: MindmapNode, depth: number, path: string[]): Located | null => {
    const here = [...path, node.text];
    if (node.id === id) return { node, depth, path: here };
    for (const child of node.children) {
      const found = walk(child, depth + 1, here);
      if (found) return found;
    }
    return null;
  };
  return walk(spec.root, 0, []);
};

const countNodes = (node: MindmapNode): number =>
  1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);

/* ------------------------------------------------------------------ *
 * Expand a node
 * ------------------------------------------------------------------ */

const EXPAND_SYSTEM_PROMPT = `You extend a mind map. The user picked one node and wants new branches under it.

Return ONLY a JSON object:

{
  "children": Node[]
}

Node is:
{
  "text": string,         // required. A SHORT phrase (2-6 words), never a sentence
  "note": string,         // optional. One or two sentences of detail
  "children": Node[]      // optional, only if the request below allows more levels
}

Hard rules:
- Output raw JSON only. No markdown fences, no commentary.
- NEVER emit ids, HTML, colours or any styling.
- Do not repeat or reword anything that already exists under the node (its current children are listed).
- New branches must belong under the picked node, fit the topic of the map, and be distinct from each other and from the map's other top-level branches.
- Siblings are the same kind of thing and are ordered meaningfully.
- Quality over quantity: a few genuinely useful branches beat padding.
- Write in the same language as the map.`;

export interface ExpandInput {
  nodeId: string;
  instruction?: string;
}

export interface ExpandedNode {
  id: string;
  text: string;
  note?: string;
  children: ExpandedNode[];
}

const newId = () => `n_${randomBytes(4).toString("hex")}`;

/**
 * Cuts a model-proposed subtree to what actually fits under the node, and
 * replaces every id. `budget.nodes` is shared across the whole walk.
 */
export const fitToCapacity = (
  nodes: MindmapNode[],
  levels: number,
  siblingRoom: number,
  budget: { nodes: number },
): ExpandedNode[] => {
  const out: ExpandedNode[] = [];
  for (const node of nodes) {
    if (out.length >= siblingRoom || budget.nodes <= 0) break;
    budget.nodes -= 1;
    out.push({
      id: newId(),
      text: node.text,
      ...(node.note ? { note: node.note } : {}),
      children:
        levels > 1
          ? fitToCapacity(node.children, levels - 1, MAX_MINDMAP_CHILDREN, budget)
          : [],
    });
  }
  return out;
};

export const expandMindmapNode = async (
  userId: number,
  documentId: number,
  input: ExpandInput,
) => {
  await assertCanSpend(userId);
  const map = await loadMap(userId, documentId);

  const target = locate(map.spec, input.nodeId);
  if (!target) {
    throw new ApiError(
      "That node isn't in the saved mind map. Wait for your edits to save, then try again.",
      STATUS_CODES.NOT_FOUND,
    );
  }

  const levelsFree = MAX_MINDMAP_DEPTH - target.depth;
  const siblingRoom = MAX_MINDMAP_CHILDREN - target.node.children.length;
  const nodeRoom = MAX_MINDMAP_NODES - countNodes(map.spec.root);
  if (levelsFree <= 0) {
    throw new ApiError(
      `This node is already at the deepest level (${MAX_MINDMAP_DEPTH}).`,
      STATUS_CODES.BAD_REQUEST,
    );
  }
  if (siblingRoom <= 0) {
    throw new ApiError(
      `This node already has the maximum of ${MAX_MINDMAP_CHILDREN} children.`,
      STATUS_CODES.BAD_REQUEST,
    );
  }
  if (nodeRoom <= 0) {
    throw new ApiError(
      `This mind map already has the maximum of ${MAX_MINDMAP_NODES} nodes.`,
      STATUS_CODES.BAD_REQUEST,
    );
  }

  const levels = Math.min(EXPAND_MAX_LEVELS, levelsFree);
  const wanted = Math.min(EXPAND_MAX_NEW_CHILDREN, siblingRoom);
  const otherBranches = map.spec.root.children
    .map((c) => c.text)
    .filter((text) => text !== target.path[1]);

  const instruction = input.instruction?.trim().slice(0, EXPAND_MAX_INSTRUCTION_CHARS);
  const userContent = [
    `Map title: ${map.spec.title}`,
    `Picked node (root to node): ${target.path.join(" > ")}`,
    `Its current children: ${
      target.node.children.length
        ? target.node.children.map((c) => c.text).join("; ")
        : "(none)"
    }`,
    otherBranches.length
      ? `Other top-level branches (avoid overlapping them): ${otherBranches.join("; ")}`
      : "",
    ``,
    `Add up to ${wanted} new children under the picked node, going ${levels} level${levels === 1 ? "" : "s"} deep at most.`,
    instruction ? `The user's request: ${instruction}` : "",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  const model = getModel();
  dlogBlock("mindmap-ai", `expand document=${documentId} node=${input.nodeId}`, {
    model,
    path: target.path,
    levels,
    wanted,
    instruction,
  });

  const completion = await createOpenRouterJsonCompletion({
    model,
    systemPrompt: EXPAND_SYSTEM_PROMPT,
    userContent,
    max_tokens: EXPAND_MAX_TOKENS,
    temperature: 0.5,
  });

  // Billed whatever the output looks like (see `charge`).
  const tokensUsed = await charge(userId, documentId, "MINDMAP_EXPAND", completion?.usage);

  const raw = completion?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new ApiError(
      "The AI returned nothing. Please try again.",
      STATUS_CODES.SERVER_ERROR,
    );
  }

  let proposed: MindmapNode[];
  try {
    const parsed = parseJsonLoosely(raw) as { children?: unknown };
    // Reuse the map validator for cleaning (text length, empty nodes, shape)
    // by wrapping the proposal as a throwaway map; ids are replaced below.
    const wrapped = validateMindmapSpec({
      title: map.title || "expansion",
      root: { text: "expansion", children: parsed.children },
    });
    if (wrapped.error) throw wrapped.error;
    proposed = (wrapped.value as MindmapSpec).root.children;
  } catch (error) {
    dlogError("mindmap-ai", `expand document=${documentId} unusable reply`, error);
    throw new ApiError(
      "The AI's reply couldn't be used, so nothing was added. That attempt still used tokens. Please try again.",
      STATUS_CODES.SERVER_ERROR,
    );
  }

  // Drop anything the model repeated from what is already there.
  const existing = new Set(
    target.node.children.map((c) => c.text.trim().toLowerCase()),
  );
  proposed = proposed.filter((n) => !existing.has(n.text.trim().toLowerCase()));

  const children = fitToCapacity(proposed, levels, siblingRoom, {
    nodes: nodeRoom,
  });
  if (children.length === 0) {
    throw new ApiError(
      "The AI didn't find anything new to add. Try describing what you'd like added.",
      STATUS_CODES.BAD_REQUEST,
    );
  }

  dlog(
    "mindmap-ai",
    `expand document=${documentId} → ${children.length} new branch(es), ${tokensUsed} tokens`,
  );
  return { children, tokensUsed };
};

/* ------------------------------------------------------------------ *
 * Ask about the map
 * ------------------------------------------------------------------ */

const ASK_SYSTEM_PROMPT = `You answer questions about a mind map. The map is given below as an indented outline; a line may end with "(note: ...)" holding extra detail.

How to answer:
- Ground every answer in the map. Quote or paraphrase its branches rather than inventing structure.
- If the map does not cover the question, say so in one sentence. You may then add a short, clearly labelled "Beyond the map:" remark from general knowledge, but never present it as part of the map.
- If a node is marked as the user's current focus, treat the question as being about it unless they clearly say otherwise.
- Be concise: a short answer first, then detail only if it helps. Plain text with short paragraphs or simple "-" lists. No markdown headings, no tables.
- Answer in the same language as the question.`;

export interface AskInput {
  question: string;
  nodeId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export const outlineOf = (spec: MindmapSpec, focusId?: string): string => {
  const lines: string[] = [];
  const walk = (node: MindmapNode, depth: number) => {
    const focus = focusId && node.id === focusId ? "  <-- the user's current focus" : "";
    const note = node.note ? ` (note: ${node.note})` : "";
    lines.push(`${"  ".repeat(depth)}- ${node.text}${note}${focus}`);
    node.children.forEach((child) => walk(child, depth + 1));
  };
  walk(spec.root, 0);

  const outline = lines.join("\n");
  return outline.length > OUTLINE_MAX_CHARS
    ? `${outline.slice(0, OUTLINE_MAX_CHARS)}\n…(map truncated)`
    : outline;
};

export const askAboutMindmap = async (
  userId: number,
  documentId: number,
  input: AskInput,
) => {
  await assertCanSpend(userId);
  const map = await loadMap(userId, documentId);

  const focusId =
    input.nodeId && locate(map.spec, input.nodeId) ? input.nodeId : undefined;

  const history = (input.history ?? [])
    .slice(-HISTORY_MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, HISTORY_MAX_CHARS),
    }));

  const model = getModel();
  dlogBlock("mindmap-ai", `ask document=${documentId}`, {
    model,
    focusId,
    historyMessages: history.length,
    questionChars: input.question.length,
  });

  const completion = await createOpenRouterChatCompletion({
    model,
    messages: [
      {
        role: "system",
        content: `${ASK_SYSTEM_PROMPT}\n\nMap title: ${map.spec.title}\n\nMap:\n${outlineOf(map.spec, focusId)}`,
      },
      ...history,
      { role: "user", content: input.question },
    ],
    max_tokens: ASK_MAX_TOKENS,
    temperature: 0.3,
  });

  const tokensUsed = await charge(userId, documentId, "MINDMAP_ASK", completion?.usage);

  const answer = completion?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new ApiError(
      "The AI returned nothing. Please try again.",
      STATUS_CODES.SERVER_ERROR,
    );
  }

  dlog("mindmap-ai", `ask document=${documentId} answered, ${tokensUsed} tokens`);
  return { answer, tokensUsed };
};

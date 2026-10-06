import type { Response } from "express";
import prisma from "@root/prisma.js";
import { extractBrief, type ContentBrief } from "./content.brief.js";
import { assembleContext } from "./content.context.js";
import { generateContent, reviseContent } from "./content.generator.js";
import { newTally, settleUsage } from "./content.meter.js";
import {
  isContentType,
  renderMarkdown,
  titleOf,
  type ContentBody,
  type ContentType,
} from "./content.schemas.js";

/**
 * Runs one chat turn for a CONTENT_AGENT assistant.
 *
 * Returns false - having written nothing to the response - when the turn is not
 * a content request (or the router failed), so the caller continues down the
 * normal streaming path. Returns true once it has fully handled the turn.
 */

export interface ContentTurnParams {
  res: Response;
  isClientAborted: () => boolean;
  signal: AbortSignal;
  userId: number;
  chat: { id: number; folderId: number | null };
  model: { id: number; externalId: string; tokenMultiplier: number | null };
  persona: string;
  temperature: number;
  userMessage: { id: number };
  assistantMessage: { id: number };
  content: string;
  history: { role: "user" | "assistant"; content: string }[];
  userContext: string[];
}

export interface ContentItemPayload {
  id: number;
  type: string;
  platform: string | null;
  title: string;
  status: string;
  version: number;
  body: ContentBody;
}

const STEP_LABELS: Record<string, string> = {
  understand: "Understanding your request",
  context: "Gathering brand and product context",
  write: "Writing",
  save: "Saving",
};

const MAX_HISTORY_MESSAGES = 6;
const HISTORY_CHARS = 1500;

const toPayload = (item: {
  id: number;
  type: string;
  platform: string | null;
  title: string;
  status: string;
  currentVersion: number;
  body: unknown;
}): ContentItemPayload => ({
  id: item.id,
  type: item.type,
  platform: item.platform,
  title: item.title,
  status: item.status,
  version: item.currentVersion,
  body: item.body as ContentBody,
});

export async function runContentAgentTurn(
  p: ContentTurnParams,
): Promise<boolean> {
  const tally = newTally();

  const lastItemRow = await prisma.contentItem.findFirst({
    where: { chatId: p.chat.id, isDeleted: false },
    orderBy: { createdAt: "desc" },
  });

  const brief = await extractBrief({
    message: p.content,
    lastItem: lastItemRow
      ? {
          id: lastItemRow.id,
          type: lastItemRow.type,
          platform: lastItemRow.platform,
          title: lastItemRow.title,
        }
      : null,
    tally,
  });
  if (!brief || brief.action === "chat") return false;
  const reviseTarget = brief.action === "revise" ? lastItemRow : null;
  if (brief.action === "revise" && !reviseTarget) return false;

  // ── From here on the agent owns the response. ──────────────────────────
  const { res } = p;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (payload: Record<string, unknown>) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (typeof (res as any).flush === "function") (res as any).flush();
    } catch {
      /* client went away - persistence below still runs */
    }
  };
  const step = (
    id: keyof typeof STEP_LABELS,
    status: "running" | "done" | "failed",
    detail?: string,
  ) => send({ type: "run_step", step: id, label: STEP_LABELS[id], status, detail });

  send({
    type: "message_id",
    userMessageId: p.userMessage.id,
    assistantMessageId: p.assistantMessage.id,
  });

  const summary = [
    brief.action === "revise" ? "Revising" : `Creating ${brief.count} × ${brief.type.replace("_", " ")}`,
    brief.platform && `for ${brief.platform}`,
  ]
    .filter(Boolean)
    .join(" ");
  step("understand", "done", summary);

  let items: ContentItemPayload[] = [];
  let markdown = "";

  try {
    step("context", "running");
    const ctx = await assembleContext({
      userId: p.userId,
      folderId: p.chat.folderId,
      brief,
      queryText: p.content,
    });
    const parts = [
      ctx.stats.brandKit ? "brand kit" : "no brand kit",
      `${ctx.stats.products} product${ctx.stats.products === 1 ? "" : "s"}`,
      `${ctx.stats.knowledgeChunks} knowledge snippet${ctx.stats.knowledgeChunks === 1 ? "" : "s"}`,
    ];
    step("context", "done", parts.join(" · "));

    step("write", "running");
    const writer = {
      model: { externalId: p.model.externalId },
      persona: p.persona,
      temperature: Math.min(p.temperature, 0.9),
      stableBlock: ctx.stableBlock,
      knowledgeBlock: ctx.knowledgeBlock,
      userContext: p.userContext,
      tally,
      signal: p.signal,
    };

    let bodies: ContentBody[];
    if (reviseTarget) {
      const type = reviseTarget.type as ContentType;
      bodies = [
        await reviseContent({
          ...writer,
          type,
          platform: reviseTarget.platform,
          existing: reviseTarget.body as ContentBody,
          instruction: brief.instruction || p.content,
        }),
      ];
    } else {
      bodies = await generateContent({
        ...writer,
        brief,
        userRequest: p.content,
        history: p.history
          .slice(-MAX_HISTORY_MESSAGES)
          .map((m) => ({ ...m, content: m.content.slice(0, HISTORY_CHARS) })),
      });
    }
    step("write", "done", `${bodies.length} piece${bodies.length === 1 ? "" : "s"}`);

    if (p.isClientAborted()) {
      // User stopped it: don't save, but they still consumed the tokens.
      await prisma.$transaction((tx) =>
        settleUsage(tx, {
          userId: p.userId,
          model: p.model,
          chatId: p.chat.id,
          messageId: p.assistantMessage.id,
          tally,
          referenceId: `content_usage_${p.assistantMessage.id}`,
          reason: "CONTENT_ABORTED",
        }),
      );
      if (!res.writableEnded) res.end();
      return true;
    }

    step("save", "running");
    markdown = renderBody(brief, bodies, reviseTarget?.type as ContentType | undefined);

    const saved = await prisma.$transaction(async (tx) => {
      const out: ContentItemPayload[] = [];

      if (reviseTarget) {
        const type = reviseTarget.type as ContentType;
        const nextVersion = reviseTarget.currentVersion + 1;
        const title = titleOf(type, bodies[0]);
        const updated = await tx.contentItem.update({
          where: { id: reviseTarget.id },
          data: {
            body: bodies[0] as any,
            title,
            currentVersion: nextVersion,
            status: "READY",
            approvedAt: null,
          },
        });
        await tx.contentVersion.create({
          data: {
            contentItemId: updated.id,
            version: nextVersion,
            title,
            body: bodies[0] as any,
            source: "REVISION",
            note: (brief.instruction || p.content).slice(0, 300),
          },
        });
        out.push(toPayload(updated));
      } else {
        for (const body of bodies) {
          const title = titleOf(brief.type, body);
          const created = await tx.contentItem.create({
            data: {
              userId: p.userId,
              folderId: p.chat.folderId,
              chatId: p.chat.id,
              messageId: p.assistantMessage.id,
              type: brief.type,
              platform: brief.platform,
              title,
              body: body as any,
              brief: brief as any,
              status: "READY",
              versions: {
                create: { version: 1, title, body: body as any, source: "AI" },
              },
            },
          });
          out.push(toPayload(created));
        }
      }

      const adjusted = await settleUsage(tx, {
        userId: p.userId,
        model: p.model,
        chatId: p.chat.id,
        messageId: p.assistantMessage.id,
        tally,
        referenceId: `content_usage_${p.assistantMessage.id}`,
        reason: "CONTENT_AGENT",
      });

      await tx.message.update({
        where: { id: p.assistantMessage.id },
        data: { content: markdown },
      });
      await tx.modelResponse.create({
        data: {
          chatId: p.chat.id,
          messageId: p.assistantMessage.id,
          modelId: p.model.id,
          content: markdown,
          promptTokens: adjusted.finalRawPrompt,
          completionTokens: adjusted.finalRawCompletion,
          totalTokens: adjusted.finalRawTotal,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      return { out, adjusted };
    });

    items = saved.out;
    step("save", "done");

    await streamText(send, markdown);
    send({ type: "content_items", items });
    send({
      type: "done",
      promptTokens: saved.adjusted.finalRawPrompt,
      completionTokens: saved.adjusted.finalRawCompletion,
      totalTokens: saved.adjusted.finalRawTotal,
    });
  } catch (error: any) {
    console.error("[content-agent] turn failed:", error);
    step("write", "failed", "Generation failed");

    // Still persist + bill whatever was spent, so the transcript is coherent
    // and a failed run is not free compute.
    markdown =
      "I couldn't produce that content just now. Please try again, or rephrase the request.";
    try {
      await prisma.$transaction(async (tx) => {
        const adjusted = tally.calls
          ? await settleUsage(tx, {
              userId: p.userId,
              model: p.model,
              chatId: p.chat.id,
              messageId: p.assistantMessage.id,
              tally,
              referenceId: `content_usage_${p.assistantMessage.id}`,
              reason: "CONTENT_AGENT_FAILED",
            })
          : null;
        await tx.message.update({
          where: { id: p.assistantMessage.id },
          data: { content: markdown },
        });
        await tx.modelResponse.create({
          data: {
            chatId: p.chat.id,
            messageId: p.assistantMessage.id,
            modelId: p.model.id,
            content: markdown,
            promptTokens: adjusted?.finalRawPrompt ?? 0,
            completionTokens: adjusted?.finalRawCompletion ?? 0,
            totalTokens: adjusted?.finalRawTotal ?? 0,
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      });
    } catch (persistError) {
      console.error("[content-agent] failed to persist failure:", persistError);
    }
    await streamText(send, markdown);
    send({ type: "done", promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  }

  if (!res.writableEnded) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
  return true;
}

function renderBody(
  brief: ContentBrief,
  bodies: ContentBody[],
  reviseType?: ContentType,
): string {
  const type: ContentType =
    reviseType ?? (isContentType(brief.type) ? brief.type : "social_post");
  const rendered = bodies.map((b, i) => {
    const text = renderMarkdown(type, b, brief.platform);
    return bodies.length > 1 ? `### Option ${i + 1}\n\n${text}` : text;
  });
  let out = rendered.join("\n\n---\n\n");
  if (brief.action === "create" && brief.assumptions.length) {
    out += `\n\n> **Assumptions:** ${brief.assumptions.join(" · ")}. Tell me if any should change.`;
  }
  return out;
}

async function streamText(
  send: (p: Record<string, unknown>) => void,
  text: string,
) {
  // The text is already complete; chunking it only gives the UI the same
  // progressive-reveal behaviour as a normal streamed answer.
  const CHUNK = 90;
  for (let i = 0; i < text.length; i += CHUNK) {
    send({ type: "token", content: text.slice(i, i + CHUNK) });
    await new Promise((r) => setTimeout(r, 8));
  }
}

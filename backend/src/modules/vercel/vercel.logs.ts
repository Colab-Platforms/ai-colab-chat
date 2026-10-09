import type { Response } from "express";
import prisma from "@root/prisma.js";
import { vercelRequest, vercelStream } from "./vercel.api.js";
import { deploymentState, getDeployment, pickAliasUrl, withHttps, type VercelCtx, type VercelDeploymentRaw } from "./vercel.deploy.js";
import {
  ACTIVE_STATES,
  DEPLOY_HARD_TIMEOUT_MS,
  DETACHED_POLL_MS,
  isTerminalState,
  LOG_TAIL_CHARS,
  MAX_DETACHED_FAILURES,
  MAX_LOG_LINES_STREAMED,
  STATE_POLL_MS,
} from "./vercel.types.js";

/**
 * Build-log streaming over SSE, plus the bookkeeping that makes a deploy
 * independent of whoever is watching it.
 *
 * Two upstream sources, on purpose:
 *  - GET /v3/deployments/{id}/events?follow=1 — newline-delimited JSON log
 *    lines. It covers the *build* and may stay open after it, so it is NOT a
 *    reliable "done" signal.
 *  - GET /v13/deployments/{id} every few seconds — readyState. This is the
 *    authority on when a deploy has finished.
 *
 * When the browser goes away mid-build, the log reader stops but a detached
 * poller keeps going until Vercel reports a terminal state, so the DB (and the
 * header dot) learns the outcome either way — the same spirit as
 * pushAfterAiTurn() being deliberately un-awaited.
 */

/* ------------------------------------------------------------------ *
 * SSE plumbing (same shape as code-workspace.chat.ts, which doesn't export it)
 * ------------------------------------------------------------------ */

function writeSse(res: Response, payload: Record<string, unknown>) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof (res as any).flush === "function") (res as any).flush();
}

function endSse(res: Response) {
  if (res.writableEnded || res.destroyed) return;
  res.write("data: [DONE]\n\n");
  res.end();
}

export function openSse(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

/* ------------------------------------------------------------------ *
 * Log lines
 * ------------------------------------------------------------------ */

interface VercelLogEvent {
  type?: string;
  created?: number;
  date?: number;
  text?: string;
  payload?: { text?: string; date?: number; created?: number };
}

interface LogLine {
  at: number;
  level: "info" | "error";
  text: string;
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function toLogLine(ev: VercelLogEvent): LogLine | null {
  if (ev.type === "delimiter" || ev.type === "exit" || ev.type === "deployment-state") return null;
  const raw = ev.payload?.text ?? ev.text;
  if (typeof raw !== "string") return null;
  const text = raw.replace(ANSI, "").replace(/\r/g, "").replace(/\n+$/, "");
  if (!text.trim()) return null;
  return {
    at: ev.payload?.date ?? ev.payload?.created ?? ev.date ?? ev.created ?? Date.now(),
    level: ev.type === "stderr" ? "error" : "info",
    text: ev.type === "command" ? `$ ${text}` : text,
  };
}

/** Keeps the newest LOG_TAIL_CHARS of text, trimmed at a line boundary. */
function tailOf(lines: string[]): string {
  let text = lines.join("\n");
  if (text.length > LOG_TAIL_CHARS) {
    text = text.slice(text.length - LOG_TAIL_CHARS);
    const nl = text.indexOf("\n");
    if (nl !== -1) text = text.slice(nl + 1);
  }
  return text;
}

/** The whole build log, once (non-follow). For deploys nobody streamed. */
async function fetchAllLogs(ctx: VercelCtx, deploymentId: string): Promise<string> {
  const events = await vercelRequest<VercelLogEvent[]>(
    `/v3/deployments/${encodeURIComponent(deploymentId)}/events?limit=-1&direction=forward`,
    { ...ctx, allowStatuses: [400, 404] },
  );
  if (!Array.isArray(events)) return "";
  return tailOf(events.map(toLogLine).filter((l): l is LogLine => !!l).map((l) => l.text));
}

/* ------------------------------------------------------------------ *
 * Finishing a deploy — shared by the stream and the detached poller.
 * ------------------------------------------------------------------ */

interface Finished {
  state: string;
  url: string | null;
  aliasUrl: string | null;
  errorMessage: string | null;
}

/**
 * Records a terminal state. Idempotent: only the first caller for a row writes,
 * so a stream and a detached poller racing on the same deploy is harmless.
 */
async function recordTerminal(rowId: number, dep: VercelDeploymentRaw, logTail?: string): Promise<Finished> {
  const state = deploymentState(dep);
  const aliasUrl = state === "READY" ? pickAliasUrl(dep) : null;
  const errorMessage =
    state === "ERROR" ? dep.errorMessage || "The build failed — see the logs for details" : state === "CANCELED" ? "Deployment was canceled" : null;
  const finished: Finished = { state, url: withHttps(dep.url), aliasUrl, errorMessage };

  const row = await prisma.vercelDeployment.findUnique({ where: { id: rowId } });
  if (!row) return finished;

  const updated = await prisma.vercelDeployment.updateMany({
    where: { id: rowId, readyState: { in: [...ACTIVE_STATES] } },
    data: {
      readyState: state,
      url: finished.url ?? row.url,
      aliasUrl,
      errorMessage,
      finishedAt: new Date(),
      ...(logTail !== undefined ? { logTail } : {}),
    },
  });
  if (updated.count === 0) return finished; // someone else already recorded it

  // Only the link's *latest* deploy may move its status — an older deploy
  // finishing late must not overwrite a newer one.
  await prisma.vercelProjectLink.updateMany({
    where: { id: row.linkId, lastDeploymentId: row.vercelDeploymentId },
    data: {
      lastDeployState: state,
      lastError: errorMessage,
      ...(state === "READY"
        ? {
            lastDeployedVersion: row.version,
            lastDeployedAt: new Date(),
            lastDeploymentUrl: finished.url ?? row.url,
            ...(aliasUrl ? { productionUrl: aliasUrl } : {}),
          }
        : {}),
    },
  });
  return finished;
}

async function recordState(rowId: number, state: string) {
  await prisma.vercelDeployment.updateMany({
    where: { id: rowId, readyState: { in: [...ACTIVE_STATES] } },
    data: { readyState: state },
  });
  const row = await prisma.vercelDeployment.findUnique({ where: { id: rowId }, select: { linkId: true, vercelDeploymentId: true } });
  if (row) {
    await prisma.vercelProjectLink.updateMany({
      where: { id: row.linkId, lastDeploymentId: row.vercelDeploymentId },
      data: { lastDeployState: state },
    });
  }
}

/* ------------------------------------------------------------------ *
 * Detached finisher
 * ------------------------------------------------------------------ */

/** Rows some process is already following (a live stream or a detached poller). */
const watched = new Set<number>();
/**
 * Rows whose detached poller just failed, and how often in a row. getStatus()
 * re-arms a watcher every couple of seconds, so without this a token Vercel
 * keeps refusing would turn the header's polling into a request loop.
 */
const failures = new Map<number, { count: number; until: number }>();

/** Starts a detached poller for an in-flight row unless something already watches it. */
export function ensureWatched(rowId: number, ctx: VercelCtx): void {
  if (watched.has(rowId)) return;
  if ((failures.get(rowId)?.until ?? 0) > Date.now()) return;
  void finishDeploymentDetached(rowId, ctx);
}

/** Give up tracking: the build may live on, but the row must leave the active set. */
async function abandon(rowId: number, message: string) {
  failures.delete(rowId);
  await prisma.vercelDeployment
    .updateMany({ where: { id: rowId, readyState: { in: [...ACTIVE_STATES] } }, data: { readyState: "ERROR", errorMessage: message, finishedAt: new Date() } })
    .catch(() => undefined);
  const row = await prisma.vercelDeployment.findUnique({ where: { id: rowId }, select: { linkId: true, vercelDeploymentId: true } });
  if (row) {
    await prisma.vercelProjectLink
      .updateMany({ where: { id: row.linkId, lastDeploymentId: row.vercelDeploymentId }, data: { lastDeployState: "ERROR", lastError: message } })
      .catch(() => undefined);
  }
}

export async function finishDeploymentDetached(rowId: number, ctx: VercelCtx): Promise<void> {
  if (watched.has(rowId)) return;
  watched.add(rowId);
  try {
    const row = await prisma.vercelDeployment.findUnique({ where: { id: rowId } });
    if (!row || isTerminalState(row.readyState)) {
      failures.delete(rowId);
      return;
    }
    const giveUpAt = row.startedAt.getTime() + DEPLOY_HARD_TIMEOUT_MS * 2;

    while (Date.now() < giveUpAt) {
      let dep: VercelDeploymentRaw;
      try {
        dep = await getDeployment(ctx, row.vercelDeploymentId);
      } catch (error: any) {
        if (error?.statusCode === 404) {
          // Deleted on vercel.com — nothing will ever finish it.
          await recordTerminal(rowId, { id: row.vercelDeploymentId, url: row.url, readyState: "CANCELED" });
          return;
        }
        throw error;
      }
      failures.delete(rowId);
      const state = deploymentState(dep);
      if (isTerminalState(state)) {
        const logTail = await fetchAllLogs(ctx, row.vercelDeploymentId).catch(() => undefined);
        await recordTerminal(rowId, dep, logTail || undefined);
        return;
      }
      await recordState(rowId, state);
      await new Promise((r) => setTimeout(r, DETACHED_POLL_MS));
    }
    // Vercel has had twice the hard timeout and still hasn't settled: stop
    // following it rather than leaving the header spinning forever.
    await abandon(rowId, "Lost track of this deployment — check it on Vercel.");
  } catch (error: any) {
    // Back off, and after a few failures in a row stop pretending we can track
    // it — a token Vercel refuses would otherwise never resolve the row.
    const count = (failures.get(rowId)?.count ?? 0) + 1;
    failures.set(rowId, { count, until: Date.now() + DETACHED_POLL_MS * 2 ** Math.min(count, 5) });
    console.warn(`[vercel] detached finisher for deployment row ${rowId} failed (${count})`, error?.message ?? error);
    if (count >= MAX_DETACHED_FAILURES) {
      await abandon(rowId, error?.message || "Lost track of this deployment — check it on Vercel.");
    }
  } finally {
    watched.delete(rowId);
  }
}

/* ------------------------------------------------------------------ *
 * The stream
 * ------------------------------------------------------------------ */

interface FollowOptions {
  res: Response;
  rowId: number;
  vercelDeploymentId: string;
  ctx: VercelCtx;
  dashboardUrl: string;
}

/**
 * Streams one deployment to the client until it reaches a terminal state, the
 * client leaves, or the hard timeout. Always ends the response.
 */
async function follow({ res, rowId, vercelDeploymentId, ctx, dashboardUrl }: FollowOptions): Promise<void> {
  const startedAt = Date.now();
  const upstream = new AbortController();
  const lines: string[] = [];
  let streamedLines = 0;
  let truncated = false;
  let finished = false;
  let clientGone = false;
  let lastState = "";
  let dirtyLog = false;

  watched.add(rowId);

  const flushLog = async () => {
    if (!dirtyLog) return;
    dirtyLog = false;
    await prisma.vercelDeployment
      .updateMany({ where: { id: rowId, readyState: { in: [...ACTIVE_STATES] } }, data: { logTail: tailOf(lines) } })
      .catch(() => undefined);
  };

  const onLine = (line: LogLine) => {
    lines.push(line.text);
    if (lines.length > MAX_LOG_LINES_STREAMED) lines.shift();
    dirtyLog = true;
    if (truncated) return;
    if (++streamedLines > MAX_LOG_LINES_STREAMED) {
      truncated = true;
      writeSse(res, { type: "log", at: Date.now(), level: "info", text: `… log truncated — the full log is on Vercel: ${dashboardUrl}` });
      return;
    }
    writeSse(res, { type: "log", ...line });
  };

  // 1. Log reader — best effort. Its failure never fails the deploy.
  const readLogs = (async () => {
    try {
      const response = await vercelStream(
        `/v3/deployments/${encodeURIComponent(vercelDeploymentId)}/events?follow=1&limit=-1&direction=forward`,
        { token: ctx.token, teamId: ctx.teamId, signal: upstream.signal },
      );
      if (!response.body) return;
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue; // keep-alive
          try {
            const line = toLogLine(JSON.parse(part) as VercelLogEvent);
            if (line) onLine(line);
          } catch {
            // Not JSON — ignore rather than break the stream.
          }
        }
      }
    } catch (error: any) {
      if (upstream.signal.aborted) return;
      writeSse(res, { type: "log", at: Date.now(), level: "info", text: "(Live logs are unavailable — still tracking the deployment status.)" });
      console.warn("[vercel] log stream failed", error?.message ?? error);
    }
  })();

  const flushTimer = setInterval(() => void flushLog(), 2_000);
  const pingTimer = setInterval(() => writeSse(res, { type: "ping" }), 15_000);

  // Not req.on("close"): for a POST, Node fires that as soon as the body has
  // been read. The response closing before we end it is the real disconnect.
  res.on("close", () => {
    if (!res.writableFinished) clientGone = true;
  });

  try {
    // 2. State poller — the authority on "done".
    while (!finished && !clientGone) {
      if (Date.now() - startedAt > DEPLOY_HARD_TIMEOUT_MS) {
        writeSse(res, {
          type: "error",
          code: "DEPLOY_TIMEOUT",
          message: "This deployment is taking unusually long. It will keep going on Vercel — check the dashboard.",
          details: { dashboardUrl },
        });
        break;
      }

      let dep: VercelDeploymentRaw;
      try {
        dep = await getDeployment(ctx, vercelDeploymentId);
      } catch (error: any) {
        writeSse(res, { type: "error", code: error?.code ?? null, message: error?.message ?? "Lost track of the deployment" });
        break;
      }

      const state = deploymentState(dep);
      if (state !== lastState) {
        lastState = state;
        writeSse(res, { type: "state", readyState: state });
        if (!isTerminalState(state)) await recordState(rowId, state);
      }

      if (isTerminalState(state)) {
        // Let the last log lines arrive before closing.
        await Promise.race([readLogs, new Promise((r) => setTimeout(r, 1_500))]);
        upstream.abort();
        dirtyLog = false;
        const logTail = lines.length ? tailOf(lines) : await fetchAllLogs(ctx, vercelDeploymentId).catch(() => "");
        const result = await recordTerminal(rowId, dep, logTail);
        finished = true;
        if (result.state === "READY") {
          writeSse(res, {
            type: "ready",
            url: result.aliasUrl ?? result.url,
            aliasUrl: result.aliasUrl,
            deploymentUrl: result.url,
            durationMs: Date.now() - startedAt,
          });
        } else if (result.state === "CANCELED") {
          writeSse(res, { type: "canceled" });
        } else {
          writeSse(res, { type: "error", code: null, message: result.errorMessage ?? "The build failed" });
        }
        break;
      }

      await new Promise((r) => setTimeout(r, STATE_POLL_MS));
    }
  } finally {
    clearInterval(flushTimer);
    clearInterval(pingTimer);
    upstream.abort();
    await flushLog();
    watched.delete(rowId);
    // Nobody watching any more and Vercel isn't done: hand off so the DB still
    // learns the outcome.
    if (!finished) void finishDeploymentDetached(rowId, ctx);
    endSse(res);
  }
}

/** POST /deploy — the deployment was just created by startDeploy(). */
export async function runDeployStream(opts: {
  res: Response;
  started: {
    rowId: number;
    vercelDeploymentId: string;
    ctx: VercelCtx;
    projectName: string;
    source: string;
    readyState: string;
    url: string | null;
    inspectorUrl: string | null;
    envWarnings: { key: string; message: string }[];
  };
  dashboardUrl: string;
}): Promise<void> {
  const { res, started, dashboardUrl } = opts;
  writeSse(res, {
    type: "deploy_created",
    deploymentId: started.vercelDeploymentId,
    url: started.url,
    inspectorUrl: started.inspectorUrl,
    projectName: started.projectName,
    source: started.source,
    dashboardUrl,
  });
  writeSse(res, { type: "state", readyState: started.readyState });
  for (const w of started.envWarnings) writeSse(res, { type: "env_warning", key: w.key, message: w.message });
  await follow({ res, rowId: started.rowId, vercelDeploymentId: started.vercelDeploymentId, ctx: started.ctx, dashboardUrl });
}

/**
 * POST /deploy/:id/logs — re-attach after a refresh, a second tab, or "View logs".
 *
 * In flight: follow Vercel's stream from the start (it replays history), so
 * nothing is duplicated or lost. Finished: replay the stored tail, fetching it
 * once from Vercel when nobody ever streamed this deploy (e.g. a git push).
 */
export async function attachLogStream(opts: {
  res: Response;
  row: {
    id: number;
    vercelDeploymentId: string;
    readyState: string;
    logTail: string | null;
    url: string | null;
    aliasUrl: string | null;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date | null;
  };
  ctx: VercelCtx;
  dashboardUrl: string;
}): Promise<void> {
  const { res, row, ctx, dashboardUrl } = opts;
  writeSse(res, { type: "deploy_created", deploymentId: row.vercelDeploymentId, url: row.url, dashboardUrl, attached: true });
  writeSse(res, { type: "state", readyState: row.readyState });

  if (!isTerminalState(row.readyState)) {
    await follow({ res, rowId: row.id, vercelDeploymentId: row.vercelDeploymentId, ctx, dashboardUrl });
    return;
  }

  let logTail = row.logTail ?? "";
  if (!logTail) {
    logTail = await fetchAllLogs(ctx, row.vercelDeploymentId).catch(() => "");
    if (logTail) await prisma.vercelDeployment.update({ where: { id: row.id }, data: { logTail } }).catch(() => undefined);
  }
  for (const text of logTail.split("\n")) {
    if (text) writeSse(res, { type: "log", at: row.startedAt.getTime(), level: "info", text, replay: true });
  }

  if (row.readyState === "READY") {
    writeSse(res, {
      type: "ready",
      url: row.aliasUrl ?? row.url,
      aliasUrl: row.aliasUrl,
      deploymentUrl: row.url,
      durationMs: row.finishedAt ? row.finishedAt.getTime() - row.startedAt.getTime() : null,
    });
  } else if (row.readyState === "CANCELED") {
    writeSse(res, { type: "canceled" });
  } else {
    writeSse(res, { type: "error", code: null, message: row.errorMessage ?? "The build failed" });
  }
  endSse(res);
}

/** Writes a pre-stream failure as SSE, for errors after the headers are out. */
export function streamFailure(res: Response, error: any) {
  writeSse(res, {
    type: "error",
    code: error?.code ?? null,
    message: error?.message ?? "Something went wrong",
    details: error?.details ?? null,
  });
  endSse(res);
}

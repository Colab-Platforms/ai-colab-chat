import cron from "node-cron";
import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { runPendingDocumentJobs } from "@/modules/document/document.generation.service.js";

const STALE_PROCESSING_MINUTES = Number(
  process.env.DOCUMENT_STALE_MINUTES ?? 5,
);

/**
 * Enqueue kicks the worker directly, so this tick is a safety net rather than
 * the primary trigger: it picks up rows orphaned by a restart and retries the
 * ones that failed transiently. It still runs often, because a user waiting on
 * a document notices poll latency in a way that background jobs do not.
 */
async function reclaimStaleDocuments() {
  const staleBefore = dayjs()
    .subtract(STALE_PROCESSING_MINUTES, "minute")
    .toDate();

  // Stuck in PROCESSING past this window means the worker died mid-render
  // (deploy, restart, Chromium crash). Put it back on the queue — attempts is
  // already incremented per failure, so this cannot loop forever.
  const { count } = await prisma.generatedDocument.updateMany({
    where: { status: "PROCESSING", startedAt: { lt: staleBefore } },
    data: {
      status: "PENDING",
      lastError: "Stale — worker did not complete in time",
    },
  });

  if (count > 0) {
    console.log(`[document-generation] reclaimed ${count} stale job(s)`);
  }
}

const task = () => {
  cron.schedule("*/1 * * * *", async () => {
    try {
      await reclaimStaleDocuments();
      await runPendingDocumentJobs();
    } catch (error) {
      console.error("[document-generation] cron tick error:", error);
    }
  });
};

export default task;

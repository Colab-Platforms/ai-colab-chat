import cron from "node-cron";
import prisma from "@root/prisma.js";
import dayjs from "dayjs";
import { distillChatIntoFolderMemory } from "@/modules/context/context-distillation.service.js";

const BATCH_SIZE = 10;
const STALE_PROCESSING_MINUTES = 10;

async function reclaimStaleJobs() {
  const staleBefore = dayjs().subtract(STALE_PROCESSING_MINUTES, "minute").toDate();

  // A job stuck in PROCESSING past this window means the worker died
  // mid-run (deploy/restart/crash) - fail it out so it can be re-enqueued
  // naturally by the next assistant turn in that chat.
  await prisma.contextDistillationJob.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: staleBefore } },
    data: { status: "FAILED", lastError: "Stale - worker did not complete in time" },
  });
}

async function processJob(job: { id: number; chatId: number; folderId: number }) {
  console.log(
    `[context-distillation] PICKED UP job=${job.id} chat=${job.chatId} folder=${job.folderId}`,
  );
  await prisma.contextDistillationJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING" },
  });

  try {
    await distillChatIntoFolderMemory(job.chatId, job.folderId);
    await prisma.contextDistillationJob.update({
      where: { id: job.id },
      data: { status: "DONE" },
    });
    console.log(`[context-distillation] DONE job=${job.id} chat=${job.chatId}`);
  } catch (error: any) {
    console.error(
      `[context-distillation] job ${job.id} (chat ${job.chatId}) failed:`,
      error,
    );
    await prisma.contextDistillationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError: String(error?.message ?? error).slice(0, 1000),
      },
    });
  }
}

const task = () => {
  cron.schedule("*/2 * * * *", async () => {
    try {
      await reclaimStaleJobs();

      const jobs = await prisma.contextDistillationJob.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: BATCH_SIZE,
      });

      if (jobs.length === 0) return;

      console.log(`[context-distillation] processing ${jobs.length} job(s)`);
      for (const job of jobs) {
        await processJob(job);
      }
    } catch (error) {
      console.error("[context-distillation] cron tick error:", error);
    }
  });
};

export default task;

import cron from "node-cron";
import dayjs from "dayjs";
import prisma from "@root/prisma.js";
import { runPendingKnowledgeJobs } from "@/modules/knowledge/knowledge.service.js";

const STALE_PROCESSING_MINUTES = Number(
  process.env.KNOWLEDGE_STALE_MINUTES ?? 10,
);

/**
 * Safety net, not the primary trigger: uploads kick the worker directly. This
 * tick drains bulk imports, retries transient failures, and reclaims rows a
 * restart left stuck in PROCESSING.
 */
const task = () => {
  cron.schedule("*/1 * * * *", async () => {
    try {
      await prisma.knowledgeSource.updateMany({
        where: {
          status: "PROCESSING",
          startedAt: {
            lt: dayjs().subtract(STALE_PROCESSING_MINUTES, "minute").toDate(),
          },
        },
        data: {
          status: "PENDING",
          lastError: "Stale - worker did not complete",
        },
      });
      await runPendingKnowledgeJobs();
    } catch (error) {
      console.error("[knowledge] cron tick error:", error);
    }
  });
};

export default task;

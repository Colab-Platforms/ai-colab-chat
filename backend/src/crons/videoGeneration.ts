import cron from "node-cron";
import {
  pollSubmittedVideoJobs,
  reclaimOrphanedSubmissions,
  runPendingVideoJobs,
} from "@/modules/video/video.generation.service.js";

/**
 * Safety net behind the two fast paths: create()/retry() kick submission
 * immediately, and a completed job normally arrives via the OpenRouter
 * webhook within seconds. This tick exists for what those miss — orphaned
 * submissions from a mid-request crash, and jobs whose webhook never
 * arrived (delivery failure, unreachable callback URL in some
 * environments) — so a video isn't stuck forever on infra hiccups alone.
 */
const task = () => {
  cron.schedule("*/1 * * * *", async () => {
    try {
      await reclaimOrphanedSubmissions();
      await runPendingVideoJobs();
      await pollSubmittedVideoJobs();
    } catch (error) {
      console.error("[video-generation] cron tick error:", error);
    }
  });
};

export default task;

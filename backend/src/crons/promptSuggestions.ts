import cron from "node-cron";
import PromptSuggestionService from "@/modules/prompt-suggestion/prompt-suggestion.service.js";

const service = new PromptSuggestionService();

const run = async (source: string) => {
  try {
    const created = await service.refreshIfDue();
    console.log(
      created > 0
        ? `[prompt-suggestions] ${source}: generated ${created} new suggestion(s)`
        : `[prompt-suggestions] ${source}: nothing generated (batch still fresh or LLM returned none)`,
    );
  } catch (error) {
    console.error(`[prompt-suggestions] ${source} failed:`, error);
  }
};

const task = () => {
  // Fires every night at 2 AM IST but only generates once the newest batch is
  // ~2 days old (see REFRESH_AFTER_HOURS in the service). That gives "every 2nd
  // night" without day-of-month cron math (which runs on back-to-back days at
  // month end) and stays correct across restarts and missed ticks.
  cron.schedule("0 2 * * *", () => run("nightly"), { timezone: "Asia/Kolkata" });

  // Seed an empty table / catch up after downtime without waiting for 2 AM.
  void run("startup");
};

export default task;

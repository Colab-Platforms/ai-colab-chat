import subscriptionExpiryCron from "./subscriptionExpiry.js";
import manualSubscriptionExpiryCron from "./manualSubscriptionExpiry.js";
import manualRenewalRemindersCron from "./manualRenewalReminders.js";
import contextDistillationCron from "./contextDistillation.js";
import documentGenerationCron from "./documentGeneration.js";
import voiceMemorySummaryCron from "./voiceMemorySummary.js";
import videoGenerationCron from "./videoGeneration.js";

export const startCronJobs = () => {
    subscriptionExpiryCron();
    manualSubscriptionExpiryCron();
    manualRenewalRemindersCron();
    contextDistillationCron();
    documentGenerationCron();
    voiceMemorySummaryCron();
    videoGenerationCron();
    console.log("⏰ Cron jobs started");
};

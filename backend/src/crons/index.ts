import subscriptionExpiryCron from "./subscriptionExpiry.js";
import manualSubscriptionExpiryCron from "./manualSubscriptionExpiry.js";
import manualRenewalRemindersCron from "./manualRenewalReminders.js";
import contextDistillationCron from "./contextDistillation.js";
import documentGenerationCron from "./documentGeneration.js";
import voiceMemorySummaryCron from "./voiceMemorySummary.js";
import videoGenerationCron from "./videoGeneration.js";
import promptSuggestionsCron from "./promptSuggestions.js";
import yearlyTokenGrantCron from "./yearlyTokenGrant.js";
import orgSeatGrantCron from "./orgSeatGrant.js";
import orgBillingCron from "./orgBilling.js";

export const startCronJobs = () => {
    subscriptionExpiryCron();
    manualSubscriptionExpiryCron();
    manualRenewalRemindersCron();
    contextDistillationCron();
    documentGenerationCron();
    voiceMemorySummaryCron();
    videoGenerationCron();
    promptSuggestionsCron();
    yearlyTokenGrantCron();
    orgSeatGrantCron();
    orgBillingCron();
    console.log("⏰ Cron jobs started");
};

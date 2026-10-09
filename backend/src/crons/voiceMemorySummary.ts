import cron from "node-cron";
import prisma from "@root/prisma.js";
import { generateVoiceMemorySummaryForUser } from "@/modules/voice/voice-memory.service.js";

const task = () => {
  // 11 PM in the product's home timezone (matches User.timezone's default
  // and the Indian-user-facing accent work already done for voice) —
  // explicit `timezone` so this fires at 11 PM IST regardless of what
  // timezone the host machine/container actually runs in (Render's default
  // is UTC, which would otherwise fire this at 4:30 AM IST).
  cron.schedule(
    "0 23 * * *",
    async () => {
      try {
        const usersWithVoiceChats = await prisma.chat.findMany({
          where: { capability: "VOICE", isDeleted: false },
          distinct: ["userId"],
          select: { userId: true },
        });

        console.log(
          `[voice-memory] nightly run — ${usersWithVoiceChats.length} user(s) with voice chats`,
        );

        for (const { userId } of usersWithVoiceChats) {
          try {
            await generateVoiceMemorySummaryForUser(userId);
          } catch (error) {
            console.error(`[voice-memory] failed for user=${userId}:`, error);
          }
        }
      } catch (error) {
        console.error("[voice-memory] cron tick error:", error);
      }
    },
    { timezone: "Asia/Kolkata" },
  );
};

export default task;

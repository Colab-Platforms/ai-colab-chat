/**
 * One-off manual trigger for the nightly voice-memory-summary cron
 * (src/crons/voiceMemorySummary.ts), so you don't have to wait for 11 PM
 * IST to see personalised voice greetings pick up recent conversations.
 *
 * Run with: npx tsx src/scripts/runVoiceMemorySummaryNow.ts
 */
import prisma from "@root/prisma.js";
import { generateVoiceMemorySummaryForUser } from "@/modules/voice/voice-memory.service.js";

async function main() {
  const usersWithVoiceChats = await prisma.chat.findMany({
    where: { capability: "VOICE", isDeleted: false },
    distinct: ["userId"],
    select: { userId: true },
  });

  console.log(`[voice-memory] manual run — ${usersWithVoiceChats.length} user(s) with voice chats`);

  for (const { userId } of usersWithVoiceChats) {
    try {
      await generateVoiceMemorySummaryForUser(userId);
      console.log(`[voice-memory] done for user=${userId}`);
    } catch (error) {
      console.error(`[voice-memory] failed for user=${userId}:`, error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[voice-memory] manual run error:", error);
    process.exit(1);
  });

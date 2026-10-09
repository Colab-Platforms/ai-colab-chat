/**
 * Manually runs the nightly voice-memory summary job on demand, instead of
 * waiting for the 11 PM IST cron (crons/voiceMemorySummary.ts).
 *
 * Usage:
 *   npx tsx src/scripts/triggerVoiceMemorySummary.ts            # all users with voice chats
 *   npx tsx src/scripts/triggerVoiceMemorySummary.ts <userId>   # one user only
 */

import dotenv from "dotenv";
dotenv.config();

import prisma from "@root/prisma.js";
import { generateVoiceMemorySummaryForUser } from "@/modules/voice/voice-memory.service.js";

async function main() {
  const userIdArg = process.argv[2];

  const userIds = userIdArg
    ? [Number(userIdArg)]
    : (
        await prisma.chat.findMany({
          where: { capability: "VOICE", isDeleted: false },
          distinct: ["userId"],
          select: { userId: true },
        })
      ).map((c) => c.userId);

  console.log(`[trigger-voice-memory] running for ${userIds.length} user(s): ${userIds.join(", ")}`);

  for (const userId of userIds) {
    try {
      await generateVoiceMemorySummaryForUser(userId);
      console.log(`[trigger-voice-memory] done — user=${userId}`);
    } catch (error) {
      console.error(`[trigger-voice-memory] failed — user=${userId}:`, error);
    }
  }

  await prisma.$disconnect();
}

main();

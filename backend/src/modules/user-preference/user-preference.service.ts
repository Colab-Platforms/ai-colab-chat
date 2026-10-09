import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { UpdatePreferencesBody } from "./user-preference.types.js";

class UserPreferenceService {
  async getPreferences(userId: number) {
    let preference = await prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!preference) {
      // Auto-seed name context from the user's profile for existing users
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new ApiError("User not found", STATUS_CODES.NOT_FOUND);

      preference = await prisma.userPreference.create({
        data: {
          userId,
          enableFollowUpQuestions: true,
        },
      });
    }

    return preference;
  }

  async updatePreferences(userId: number, data: UpdatePreferencesBody) {
    const updateData: Partial<UpdatePreferencesBody> = {};

    if (data.enableFollowUpQuestions !== undefined) {
      updateData.enableFollowUpQuestions = data.enableFollowUpQuestions;
    }

    if (data.voiceId !== undefined) {
      updateData.voiceId = data.voiceId;
    }

    const preference = await prisma.userPreference.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        enableFollowUpQuestions: data.enableFollowUpQuestions ?? true,
        voiceId: data.voiceId ?? null,
      },
    });

    return preference;
  }
}

export default UserPreferenceService;

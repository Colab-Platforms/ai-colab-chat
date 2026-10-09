import Joi from "joi";
import { VOICE_IDS } from "@/modules/voice/voice-options.js";

const updatePreferencesSchema = Joi.object({
  enableFollowUpQuestions: Joi.boolean().optional(),
  // null resets to the voice-agent's env-configured default voice.
  voiceId: Joi.string()
    .valid(...VOICE_IDS)
    .allow(null)
    .optional(),
}).min(1);

export const validateUpdatePreferencesSchema = (data: unknown) => {
  return updatePreferencesSchema.validate(data, { abortEarly: false });
};

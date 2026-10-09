import Joi from "joi";
import {
  MAX_PROMPT_CHARS,
  SUPPORTED_ASPECT_RATIOS,
  SUPPORTED_RESOLUTIONS,
} from "./video.types.js";

export const createVideoSchema = Joi.object({
  prompt: Joi.string().trim().max(MAX_PROMPT_CHARS).required().messages({
    "string.empty": "Prompt is required",
    "any.required": "Prompt is required",
    "string.max": `Prompt cannot exceed ${MAX_PROMPT_CHARS} characters`,
  }),
  chatId: Joi.number().integer().optional().allow(null),
  messageId: Joi.number().integer().optional().allow(null),
  modelId: Joi.number().integer().positive().optional(),
  // https-only, same SSRF-safety rule document.validators.ts's image block
  // uses — a model-facing URL is never trusted to be http(s)-safe otherwise.
  firstFrameUrl: Joi.string().uri({ scheme: ["https"] }).max(2000).optional(),
  lastFrameUrl: Joi.string().uri({ scheme: ["https"] }).max(2000).optional(),
  // Duration/resolution are further checked in the service against the
  // chosen model's actual supported_durations/supported_resolutions — this
  // just keeps obviously-bad input out.
  duration: Joi.number().integer().min(1).max(60).optional(),
  resolution: Joi.string()
    .valid(...SUPPORTED_RESOLUTIONS)
    .optional(),
  aspectRatio: Joi.string()
    .valid(...SUPPORTED_ASPECT_RATIOS)
    .optional(),
});

export const validateCreateVideoSchema = (data: unknown) => {
  return createVideoSchema.validate(data, { abortEarly: false });
};

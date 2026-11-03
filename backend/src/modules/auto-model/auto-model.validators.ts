import Joi from "joi";

const resolveSchema = Joi.object({
  content: Joi.string().allow("").max(100_000).required(),
  chatId: Joi.number().integer().positive().allow(null).optional(),
  // "CODE" is the code-workspace pill; it isn't a ModelCapability.
  chatType: Joi.string()
    .valid("STANDARD", "DEEP_RESEARCH", "IMAGE_GENERATION", "WEB_SEARCH", "VISION", "CODE")
    .optional(),
  attachmentIds: Joi.array().items(Joi.number().integer().positive()).max(5).optional(),
});

export const validateResolveSchema = (data: unknown) => {
  return resolveSchema.validate(data, { abortEarly: false });
};

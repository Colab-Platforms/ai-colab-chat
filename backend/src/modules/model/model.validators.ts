import Joi from "joi";

export const createModelSchema = Joi.object({
  name: Joi.string().trim().required(),
  modelProviderId: Joi.number().integer().positive().required(),
  externalId: Joi.string().trim().required(),
  capabilities: Joi.array()
    .items(
      Joi.string().valid(
        "STANDARD",
        "DEEP_RESEARCH",
        "IMAGE_GENERATION",
        "WEB_SEARCH",
        "VISION",
        "VOICE",
        "VIDEO_GENERATION",
      ),
    )
    .min(1)
    .required(),
  description: Joi.string().trim().allow(null, "").optional(),
  tokenMultiplier: Joi.number().optional(),
  // Wallet tokens per second of video — only meaningful for a
  // VIDEO_GENERATION model, but not conditionally required here since
  // capabilities can be set before this is calibrated.
  videoCostPerSecond: Joi.number().integer().min(0).optional(),
  // Video-credit price per second (CreditWallet unit, $0.03/credit real
  // cost) — the flat fallback rate; per-resolution rates are seed-managed.
  creditCostPerSecond: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
  defaultForCapabilities: Joi.array()
    .items(
      Joi.string().valid(
        "STANDARD",
        "DEEP_RESEARCH",
        "IMAGE_GENERATION",
        "WEB_SEARCH",
        "VISION",
        "VOICE",
        "VIDEO_GENERATION",
      ),
    )
    .optional(),
});

export const updateModelSchema = Joi.object({
  name: Joi.string().trim().optional(),
  modelProviderId: Joi.number().integer().positive().optional(),
  externalId: Joi.string().trim().optional(),
  capabilities: Joi.array()
    .items(
      Joi.string().valid(
        "STANDARD",
        "DEEP_RESEARCH",
        "IMAGE_GENERATION",
        "WEB_SEARCH",
        "VISION",
        "VOICE",
        "VIDEO_GENERATION",
      ),
    )
    .min(1)
    .optional(),
  description: Joi.string().trim().allow(null, "").optional(),
  tokenMultiplier: Joi.number().optional(),
  videoCostPerSecond: Joi.number().integer().min(0).optional(),
  creditCostPerSecond: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
  defaultForCapabilities: Joi.array()
    .items(
      Joi.string().valid(
        "STANDARD",
        "DEEP_RESEARCH",
        "IMAGE_GENERATION",
        "WEB_SEARCH",
        "VISION",
        "VOICE",
        "VIDEO_GENERATION",
      ),
    )
    .optional(),
})
  .min(1)
  .unknown(false);

export const validateCreateModelSchema = (data: unknown) => {
  return createModelSchema.validate(data, { abortEarly: false });
};

export const validateUpdateModelSchema = (data: unknown) => {
  return updateModelSchema.validate(data, { abortEarly: false, convert: true });
};

import Joi from "joi";

const folderId = Joi.number().integer().positive().allow(null).optional();
const strList = (maxItems: number, maxLen = 300) =>
  Joi.array().items(Joi.string().trim().max(maxLen)).max(maxItems).default([]);

export const updateItemSchema = Joi.object({
  title: Joi.string().trim().max(200).optional(),
  body: Joi.object().unknown(true).required(),
});

export const regenerateSchema = Joi.object({
  instruction: Joi.string().trim().min(1).max(1000).required(),
  modelId: Joi.number().integer().positive().optional(),
});

export const brandKitSchema = Joi.object({
  folderId,
  name: Joi.string().trim().min(1).max(120).required(),
  voice: Joi.string().trim().max(2000).allow("").default(""),
  audience: Joi.string().trim().max(1000).allow("").default(""),
  bannedWords: strList(100, 80),
  mustInclude: strList(50, 120),
  ctaRules: Joi.string().trim().max(1000).allow(null, "").optional(),
  examples: strList(3, 2000),
});

export const productSchema = Joi.object({
  folderId,
  name: Joi.string().trim().min(1).max(120).required(),
  summary: Joi.string().trim().max(2000).allow("").default(""),
  features: strList(50),
  pricing: Joi.string().trim().max(500).allow(null, "").optional(),
  claimsAllowed: strList(50),
  claimsForbidden: strList(50),
});

export const validate = <T>(schema: Joi.ObjectSchema, data: unknown) =>
  schema.validate(data, { abortEarly: false, stripUnknown: true }) as {
    error?: Joi.ValidationError;
    value: T;
  };

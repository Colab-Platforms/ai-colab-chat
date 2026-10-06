import Joi from "joi";

const TYPES = ["DOCUMENT", "PAST_POST", "PRODUCT_DOC", "COMPETITOR", "NOTE"];

const metadata = Joi.object().unknown(true).default({});

export const createTextSourceSchema = Joi.object({
  folderId: Joi.number().integer().positive().allow(null).optional(),
  type: Joi.string()
    .valid(...TYPES)
    .default("NOTE"),
  title: Joi.string().trim().min(1).max(200).required(),
  text: Joi.string().trim().min(1).max(200_000).required(),
  metadata,
});

export const uploadSourceSchema = Joi.object({
  folderId: Joi.number().integer().positive().allow(null, "").optional(),
  type: Joi.string()
    .valid(...TYPES)
    .default("DOCUMENT"),
  title: Joi.string().trim().max(200).allow("").optional(),
  // multipart sends metadata as a JSON string
  metadata: Joi.alternatives(
    Joi.object().unknown(true),
    Joi.string(),
  ).optional(),
});

export const bulkPostsSchema = Joi.object({
  folderId: Joi.number().integer().positive().allow(null).optional(),
  posts: Joi.array()
    .items(
      Joi.object({
        text: Joi.string().trim().min(1).max(20_000).required(),
        title: Joi.string().trim().max(200).optional(),
        platform: Joi.string().trim().lowercase().max(40).optional(),
        product: Joi.string().trim().max(120).optional(),
        metrics: Joi.object().unknown(true).optional(),
        publishedAt: Joi.string().isoDate().optional(),
      }),
    )
    .min(1)
    .max(200)
    .required(),
});

export const searchSchema = Joi.object({
  folderId: Joi.number().integer().positive().allow(null).optional(),
  query: Joi.string().trim().min(1).max(1000).required(),
  k: Joi.number().integer().min(1).max(20).default(8),
  types: Joi.array()
    .items(Joi.string().valid(...TYPES))
    .optional(),
  metadata: Joi.object().unknown(true).optional(),
});

export const validate = <T>(schema: Joi.ObjectSchema, data: unknown) =>
  schema.validate(data, { abortEarly: false }) as {
    error?: Joi.ValidationError;
    value: T;
  };

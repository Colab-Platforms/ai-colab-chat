import Joi from "joi";

const base = {
  type: Joi.string().valid("IMAGE", "VIDEO"),
  title: Joi.string().trim().max(80),
  category: Joi.string().trim().max(40).allow(null, ""),
  prompt: Joi.string().trim().max(4000),
  previewUrl: Joi.string().trim().uri().max(1000),
  previewVideoUrl: Joi.string().trim().uri().max(1000).allow(null, ""),
  aspectRatio: Joi.string().trim().max(10),
  duration: Joi.number().integer().min(1).max(60).allow(null),
  requiresPhoto: Joi.boolean(),
  sortOrder: Joi.number().integer().min(-9999).max(9999),
  isActive: Joi.boolean(),
};

export const createStudioTemplateSchema = Joi.object({
  ...base,
  type: base.type.required(),
  title: base.title.required(),
  prompt: base.prompt.required(),
  previewUrl: base.previewUrl.required(),
});

export const updateStudioTemplateSchema = Joi.object(base).min(1);

export const validateCreateStudioTemplate = (data: unknown) =>
  createStudioTemplateSchema.validate(data, { abortEarly: false });

export const validateUpdateStudioTemplate = (data: unknown) =>
  updateStudioTemplateSchema.validate(data, { abortEarly: false });

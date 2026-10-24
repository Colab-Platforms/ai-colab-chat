import Joi from "joi";

const base = {
  name: Joi.string().trim().max(100),
  description: Joi.string().trim().max(500),
  previewUrl: Joi.string().trim().uri().max(1000),
  thumbnailUrl: Joi.string().trim().uri().max(1000),
  techStack: Joi.array().items(Joi.string().trim().max(40)).max(10),
  // A faithful full-page design brief runs 8-10k characters.
  prompt: Joi.string().trim().max(12000),
  modelId: Joi.number().integer().allow(null),
  category: Joi.string().trim().max(40).allow(null, ""),
  sortOrder: Joi.number().integer().min(-9999).max(9999),
  isActive: Joi.boolean(),
};

export const createWebsiteTemplateSchema = Joi.object({
  ...base,
  name: base.name.required(),
  description: base.description.required(),
  previewUrl: base.previewUrl.required(),
  thumbnailUrl: base.thumbnailUrl.required(),
  prompt: base.prompt.required(),
});

export const updateWebsiteTemplateSchema = Joi.object(base).min(1);

export const validateCreateWebsiteTemplate = (data: unknown) =>
  createWebsiteTemplateSchema.validate(data, { abortEarly: false });

export const validateUpdateWebsiteTemplate = (data: unknown) =>
  updateWebsiteTemplateSchema.validate(data, { abortEarly: false });

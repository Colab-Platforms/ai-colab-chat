import Joi from "joi";

export const createAssistantSchema = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim().allow(null, "").optional(),
  icon: Joi.string().trim().optional(),
  kind: Joi.string().valid("SPECIALIST", "AGENT").optional(),
  bgFrom: Joi.string().trim().allow(null, "").optional(),
  bgVia: Joi.string().trim().allow(null, "").optional(),
  bgTo: Joi.string().trim().allow(null, "").optional(),
  bgFromDark: Joi.string().trim().allow(null, "").optional(),
  bgViaDark: Joi.string().trim().allow(null, "").optional(),
  bgToDark: Joi.string().trim().allow(null, "").optional(),
  systemPrompt: Joi.string().trim().required(),
  defaultModelId: Joi.number().integer().positive().allow(null).optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  suggestedPrompts: Joi.array()
    .items(Joi.string().trim())
    .allow(null)
    .optional(),
});

export const updateAssistantSchema = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().allow(null, "").optional(),
  icon: Joi.string().trim().optional(),
  kind: Joi.string().valid("SPECIALIST", "AGENT").optional(),
  bgFrom: Joi.string().trim().allow(null, "").optional(),
  bgVia: Joi.string().trim().allow(null, "").optional(),
  bgTo: Joi.string().trim().allow(null, "").optional(),
  bgFromDark: Joi.string().trim().allow(null, "").optional(),
  bgViaDark: Joi.string().trim().allow(null, "").optional(),
  bgToDark: Joi.string().trim().allow(null, "").optional(),
  systemPrompt: Joi.string().trim().optional(),
  defaultModelId: Joi.number().integer().positive().allow(null).optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  suggestedPrompts: Joi.array()
    .items(Joi.string().trim())
    .allow(null)
    .optional(),
  isActive: Joi.boolean().optional(),
})
  .min(1)
  .unknown(false);

export const validateCreateAssistant = (data: unknown) => {
  return createAssistantSchema.validate(data, { abortEarly: false });
};

export const validateUpdateAssistant = (data: unknown) => {
  return updateAssistantSchema.validate(data, {
    abortEarly: false,
    convert: true,
  });
};

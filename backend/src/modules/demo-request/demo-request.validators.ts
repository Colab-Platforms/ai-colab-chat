import Joi from "joi";

export const TEAM_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

export const createDemoRequestSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(200).required(),
  // "+91 " country prefix (added by the form) then 10-15 digits.
  phone: Joi.string()
    .trim()
    .pattern(/^\+?\d{1,3}[ ]?\d{10,15}$/)
    .allow("", null)
    .optional()
    .messages({ "string.pattern.base": "Phone must be 10-15 digits" }),
  company: Joi.string().trim().min(1).max(150).required(),
  teamSize: Joi.string().valid(...TEAM_SIZES).required(),
  features: Joi.array().items(Joi.string().trim().max(60)).max(20).default([]),
  models: Joi.array().items(Joi.string().trim().max(80)).min(1).max(40).required(),
  message: Joi.string().trim().max(2000).allow("", null).optional(),
  consent: Joi.boolean().valid(true).required().messages({
    "any.only": "Please agree so we can contact you",
  }),
  // Honeypot: hidden from people, filled by bots. Must stay empty.
  website: Joi.string().allow("", null).max(0).optional(),
});

export const listDemoRequestsSchema = Joi.object({
  page: Joi.number().integer().min(1),
  pageSize: Joi.number().integer().min(1).max(100),
  status: Joi.string().valid("NEW", "CONTACTED", "QUALIFIED", "CLOSED"),
  search: Joi.string().trim().max(100).allow(""),
});

export const updateDemoRequestSchema = Joi.object({
  status: Joi.string().valid("NEW", "CONTACTED", "QUALIFIED", "CLOSED"),
  adminNotes: Joi.string().trim().max(4000).allow("", null),
}).min(1);

export const validateCreateDemoRequest = (data: unknown) =>
  createDemoRequestSchema.validate(data, { abortEarly: false, stripUnknown: true });

export const validateListDemoRequests = (data: unknown) =>
  listDemoRequestsSchema.validate(data, { abortEarly: false, stripUnknown: true });

export const validateUpdateDemoRequest = (data: unknown) =>
  updateDemoRequestSchema.validate(data, { abortEarly: false });

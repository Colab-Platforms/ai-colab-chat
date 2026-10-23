import Joi from "joi";

export const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().optional(),
  lastName: Joi.string().trim().optional(),
  phoneNumber: Joi.string().trim().allow(null, "").optional(),
  isGuideTaken: Joi.boolean().optional(),
});

export const deleteAccountSchema = Joi.object({
  otp: Joi.string().trim().length(6).pattern(/^\d+$/).required(),
});

export const validateDeleteAccountSchema = (data: unknown) => {
  return deleteAccountSchema.validate(data, { abortEarly: false });
};

export const validateUpdateProfileSchema = (data: unknown) => {
  return updateProfileSchema.validate(data, { abortEarly: false });
};

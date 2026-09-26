import Joi from "joi";

export const createFolderSchema = Joi.object({
  name: Joi.string().trim().required().messages({
    "string.empty": "Folder name is required",
    "any.required": "Folder name is required",
  }),
  description: Joi.string().trim().allow(null, "").optional(),
});

export const updateFolderSchema = Joi.object({
  name: Joi.string().trim().required().messages({
    "string.empty": "Folder name is required",
    "any.required": "Folder name is required",
  }),
  description: Joi.string().trim().allow(null, "").optional(),
});

export const validateCreateFolderSchema = (data: unknown) => {
  return createFolderSchema.validate(data, { abortEarly: false });
};

export const validateUpdateFolderSchema = (data: unknown) => {
  return updateFolderSchema.validate(data, { abortEarly: false });
};

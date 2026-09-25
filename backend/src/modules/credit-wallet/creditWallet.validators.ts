import Joi from "joi";

export const createTopUpSchema = Joi.object({
  amountInr: Joi.number().positive().required(),
});

export const validateCreateTopUpSchema = (data: unknown) =>
  createTopUpSchema.validate(data, { abortEarly: false });

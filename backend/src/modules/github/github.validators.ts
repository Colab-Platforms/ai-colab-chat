import Joi from "joi";

// GitHub's own rules: owner/repo are 1-100 chars of [A-Za-z0-9._-]. Enforcing
// them here keeps user input out of the API path we build with them.
const slug = Joi.string().trim().pattern(/^[A-Za-z0-9._-]{1,100}$/).required();

export const createRepoSchema = Joi.object({
  name: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9._-]{1,100}$/)
    .required()
    .messages({
      "string.pattern.base": "Repository name may only contain letters, numbers, dots, dashes and underscores",
    }),
  description: Joi.string().trim().allow("").max(350).default(""),
  isPrivate: Joi.boolean().default(true),
});

export const linkProjectSchema = Joi.object({
  owner: slug,
  repo: slug,
  initial: Joi.string().valid("push", "pull").required(),
  overwrite: Joi.boolean().default(false),
});

export const pushSchema = Joi.object({
  force: Joi.boolean().default(false),
  // The user's own commit message. Blank/absent -> the generated one (version + plan + files).
  message: Joi.string().trim().allow("").max(1000).default(""),
});

export const autoPushSchema = Joi.object({ autoPush: Joi.boolean().required() });

import Joi from "joi";
import { VERCEL_FRAMEWORKS, VERCEL_NODE_VERSIONS } from "./vercel.types.js";

// Vercel's own rules: lowercase, up to 100 chars of [a-z0-9._-], starting with
// a letter or digit, and never "---". Mirrors isValidProjectName() in vercel.detect.ts.
const projectName = Joi.string()
  .trim()
  .lowercase()
  .max(100)
  .pattern(/^[a-z0-9][a-z0-9._-]*$/)
  .custom((value: string, helpers) => (value.includes("---") ? helpers.error("any.invalid") : value))
  .messages({
    "string.pattern.base":
      "A Vercel project name may only contain lowercase letters, numbers, dots, dashes and underscores, and must start with a letter or number",
    "any.invalid": "A Vercel project name cannot contain three dashes in a row",
  });

// null means "let Vercel use the framework default"; a cleared field ("") is the same thing.
const command = Joi.string().trim().max(256).allow(null, "").empty("").default(null);
const dirPath = Joi.string()
  .trim()
  .max(256)
  // Relative, inside the project: no absolute paths, no "..".
  .pattern(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\0]*$/)
  .allow(null, "")
  .empty("")
  .default(null)
  .messages({ "string.pattern.base": "Directories must be relative to the project, without \"..\"" });

// GitHub's own rules for owner/repo — keeps user input out of the API paths we build.
const slug = Joi.string().trim().pattern(/^[A-Za-z0-9._-]{1,100}$/);

export const envVarsSchema = Joi.array()
  .max(50)
  .unique("key")
  .default([])
  .items(
    Joi.object({
      key: Joi.string()
        .trim()
        .max(256)
        .pattern(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .required()
        .messages({ "string.pattern.base": "Environment variable names may only contain letters, numbers and underscores" }),
      value: Joi.string().allow("").max(65_536).required(),
      target: Joi.array()
        .items(Joi.string().valid("production", "preview", "development"))
        .min(1)
        .unique()
        .default(["production", "preview", "development"]),
      type: Joi.string().valid("encrypted", "plain").default("encrypted"),
    }),
  )
  .messages({ "array.unique": "Each environment variable name can only be used once" });

export const deploySchema = Joi.object({
  source: Joi.string().valid("files", "git").required(),
  name: projectName.required(),
  framework: Joi.string()
    .valid(...VERCEL_FRAMEWORKS)
    .allow(null)
    .default(null),
  buildCommand: command,
  installCommand: command,
  devCommand: command,
  outputDirectory: dirPath,
  rootDirectory: dirPath,
  nodeVersion: Joi.string()
    .valid(...VERCEL_NODE_VERSIONS)
    .allow(null)
    .default(null),
  envVars: envVarsSchema,
  git: Joi.object({
    repoId: Joi.string().trim().pattern(/^\d{1,20}$/).required(),
    owner: slug.required(),
    repo: slug.required(),
    branch: Joi.string()
      .trim()
      .max(255)
      // A git ref: no spaces, no "..", no control characters.
      .pattern(/^(?!.*\.\.)[^\s~^:?*[\\\0-\x1f]+$/)
      .default("main"),
  }).when("source", { is: "git", then: Joi.required(), otherwise: Joi.forbidden() }),
});

export const detectQuerySchema = Joi.object({
  source: Joi.string().valid("files", "git").default("files"),
});

export const redeploySchema = Joi.object({ envVars: envVarsSchema });

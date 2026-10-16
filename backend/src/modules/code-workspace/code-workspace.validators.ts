import Joi from "joi";
import { MAX_FILE_CHARS, MAX_PATH_CHARS, MAX_TITLE_CHARS } from "./code-workspace.types.js";

// Path *safety* (no "..", no absolute paths) is enforced by normalizeCodePath
// in the service; these only bound sizes and shapes.
const path = Joi.string().trim().min(1).max(MAX_PATH_CHARS).required();

export const saveFileSchema = Joi.object({
  path,
  content: Joi.string().allow("").max(MAX_FILE_CHARS).required(),
});

export const deleteFileSchema = Joi.object({ path });

export const renameFileSchema = Joi.object({ from: path, to: path });

export const updateProjectSchema = Joi.object({
  title: Joi.string().trim().min(1).max(MAX_TITLE_CHARS).required(),
});

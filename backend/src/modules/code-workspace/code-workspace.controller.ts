import { Request, Response } from "express";
import type Joi from "joi";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import * as codeWorkspaceService from "./code-workspace.service.js";
import {
  deleteFileSchema,
  renameFileSchema,
  saveFileSchema,
  updateProjectSchema,
} from "./code-workspace.validators.js";

type Handler = (req: Request, res: Response) => Promise<{ data: unknown; message: string }>;

/** Shared try/catch + response shape, so each handler is just its happy path. */
const handle =
  (label: string, fn: Handler) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { data, message } = await fn(req, res);
      sendResponse(res, true, data, message, STATUS_CODES.OK);
    } catch (error: any) {
      if (!error.statusCode) console.error(`[code-workspace] ${label} error`, error);
      sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
    }
  };

function projectId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error("Invalid project id"), { statusCode: STATUS_CODES.BAD_REQUEST });
  return id;
}

function validate<T>(schema: Joi.ObjectSchema, input: unknown): T {
  const { error, value } = schema.validate(input, { stripUnknown: true });
  if (error) throw Object.assign(new Error(error.message), { statusCode: STATUS_CODES.BAD_REQUEST });
  return value as T;
}

export const getProject = handle("get project", async (req) => ({
  data: await codeWorkspaceService.getProject(req.user!.id, projectId(req)),
  message: "Project fetched",
}));

export const updateProject = handle("update project", async (req) => {
  const { title } = validate<{ title: string }>(updateProjectSchema, req.body);
  return { data: await codeWorkspaceService.renameProject(req.user!.id, projectId(req), title), message: "Project updated" };
});

export const deleteProject = handle("delete project", async (req) => ({
  data: await codeWorkspaceService.deleteProject(req.user!.id, projectId(req)),
  message: "Project deleted",
}));

export const saveFile = handle("save file", async (req) => {
  const { path, content } = validate<{ path: string; content: string }>(saveFileSchema, req.body);
  return { data: await codeWorkspaceService.saveFile(req.user!.id, projectId(req), path, content), message: "File saved" };
});

export const deleteFile = handle("delete file", async (req) => {
  const { path } = validate<{ path: string }>(deleteFileSchema, req.body);
  return { data: await codeWorkspaceService.deleteFile(req.user!.id, projectId(req), path), message: "File deleted" };
});

export const renameFile = handle("rename file", async (req) => {
  const { from, to } = validate<{ from: string; to: string }>(renameFileSchema, req.body);
  return { data: await codeWorkspaceService.renameFile(req.user!.id, projectId(req), from, to), message: "File renamed" };
});

export const listVersions = handle("list versions", async (req) => ({
  data: await codeWorkspaceService.listVersions(req.user!.id, projectId(req)),
  message: "Versions fetched",
}));

export const restoreVersion = handle("restore version", async (req) => {
  const version = Number(req.params.version);
  if (!Number.isInteger(version) || version <= 0) {
    throw Object.assign(new Error("Invalid version"), { statusCode: STATUS_CODES.BAD_REQUEST });
  }
  return {
    data: await codeWorkspaceService.restoreVersion(req.user!.id, projectId(req), version),
    message: `Restored version ${version}`,
  };
});

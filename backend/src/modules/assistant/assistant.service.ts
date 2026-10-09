import prisma from "@root/prisma.js";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { CreateAssistantBody, UpdateAssistantBody } from "./assistant.types.js";
import {
  getPaginationOptions,
  formatPaginationResponse,
} from "@/utils/paginationUtils.js";
import { buildPrismaQuery } from "prisma-qb";
import { CODE_ASSISTANT_SLUG } from "@/modules/code-workspace/code-workspace.types.js";

/**
 * The slug stays internal, but the client needs to know whether this
 * assistant gets the code workspace (Code pill + live editor panel).
 */
function toPublicAssistant<T extends { slug: string }>({ slug, ...rest }: T) {
  return { ...rest, supportsCodeMode: slug === CODE_ASSISTANT_SLUG };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function createInternalSlug(name: string): string {
  const base = slugify(name) || "assistant";
  return `${base}-${Date.now().toString(36)}`;
}

function supportsAssistantGradientFields(): boolean {
  const scalarEnum = (Prisma as any).AssistantScalarFieldEnum;
  if (!scalarEnum) return false;
  return (
    Object.prototype.hasOwnProperty.call(scalarEnum, "bgFrom") &&
    Object.prototype.hasOwnProperty.call(scalarEnum, "bgVia") &&
    Object.prototype.hasOwnProperty.call(scalarEnum, "bgTo") &&
    Object.prototype.hasOwnProperty.call(scalarEnum, "bgFromDark") &&
    Object.prototype.hasOwnProperty.call(scalarEnum, "bgViaDark") &&
    Object.prototype.hasOwnProperty.call(scalarEnum, "bgToDark")
  );
}

const assistantSelectWithModel = {
  id: true,
  name: true,
  slug: true,
  description: true,
  icon: true,
  bgFrom: true,
  bgVia: true,
  bgTo: true,
  bgFromDark: true,
  bgViaDark: true,
  bgToDark: true,
  systemPrompt: true,
  defaultModelId: true,
  temperature: true,
  suggestedPrompts: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  defaultModel: { select: { id: true, name: true } },
} as const;



function isMissingColumnError(error: any): boolean {
  return error?.code === "P2022";
}

class AssistantService {
  async create(data: CreateAssistantBody) {
    if (data.defaultModelId) {
      const model = await prisma.model.findFirst({
        where: { id: data.defaultModelId, isDeleted: false },
      });
      if (!model) {
        throw new ApiError("Default model not found", STATUS_CODES.NOT_FOUND);
      }
    }

    const suggestedPromptsValue =
      data.suggestedPrompts === undefined
        ? undefined
        : data.suggestedPrompts === null
          ? Prisma.JsonNull
          : data.suggestedPrompts;

    const canPersistGradient = supportsAssistantGradientFields();
    let assistant: any;
    try {
      assistant = await prisma.assistant.create({
        data: {
          name: data.name,
          slug: createInternalSlug(data.name),
          description: data.description ?? null,
          icon: data.icon ?? "Bot",
          ...(canPersistGradient
            ? {
                bgFrom: data.bgFrom ?? null,
                bgVia: data.bgVia ?? null,
                bgTo: data.bgTo ?? null,
                bgFromDark: data.bgFromDark ?? null,
                bgViaDark: data.bgViaDark ?? null,
                bgToDark: data.bgToDark ?? null,
              }
            : {}),
          systemPrompt: data.systemPrompt,
          defaultModelId: data.defaultModelId ?? null,
          temperature: data.temperature ?? 0.7,
          suggestedPrompts: suggestedPromptsValue,
        },
        select: assistantSelectWithModel,
      });
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;
      assistant = await prisma.assistant.create({
        data: {
          name: data.name,
          slug: createInternalSlug(data.name),
          description: data.description ?? null,
          icon: data.icon ?? "Bot",
          systemPrompt: data.systemPrompt,
          defaultModelId: data.defaultModelId ?? null,
          temperature: data.temperature ?? 0.7,
          suggestedPrompts: suggestedPromptsValue,
        },
        select: assistantSelectWithModel,
      });
    }

    return toPublicAssistant(assistant);
  }

  async list(query: any) {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 20);

    const { where, orderBy } = buildPrismaQuery({
      query,
      searchFields: [{ field: "name" }, { field: "description" }],
      filterFields: [{ key: "isActive", field: "isActive", type: "boolean" }],
      sortFields: [
        { key: "createdAt", field: "createdAt" },
        { key: "name", field: "name" },
        { key: "isActive", field: "isActive" },
      ],
      defaultSort: { key: "createdAt", order: "asc" },
      softDelete: { field: "isDeleted", value: false },
      allowedQueryKeys: ["page", "pageSize"],
    });

    let assistants: any[] = [];
    const totalRecords = await prisma.assistant.count({ where });
    try {
      assistants = await prisma.assistant.findMany({
        where,
        skip,
        take,
        orderBy,
        select: assistantSelectWithModel,
      });
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;
      assistants = await prisma.assistant.findMany({
        where,
        skip,
        take,
        orderBy,
        select: assistantSelectWithModel,
      });
    }

    const sanitizedAssistants = assistants.map(toPublicAssistant);
    return formatPaginationResponse(
      sanitizedAssistants,
      totalRecords,
      page,
      pageSize,
    );
  }

  async getById(assistantId: number) {
    let assistant: any = null;
    try {
      assistant = await prisma.assistant.findFirst({
        where: { id: assistantId, isDeleted: false },
        select: assistantSelectWithModel,
      });
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;
      assistant = await prisma.assistant.findFirst({
        where: { id: assistantId, isDeleted: false },
        select: assistantSelectWithModel,
      });
    }
    if (!assistant) {
      throw new ApiError("Assistant not found", STATUS_CODES.NOT_FOUND);
    }
    return toPublicAssistant(assistant);
  }

  async update(assistantId: number, data: UpdateAssistantBody) {
    const assistant = await prisma.assistant.findFirst({
      where: { id: assistantId, isDeleted: false },
      select: { id: true },
    });
    if (!assistant) {
      throw new ApiError("Assistant not found", STATUS_CODES.NOT_FOUND);
    }

    if (data.defaultModelId) {
      const model = await prisma.model.findFirst({
        where: { id: data.defaultModelId, isDeleted: false },
      });
      if (!model) {
        throw new ApiError("Default model not found", STATUS_CODES.NOT_FOUND);
      }
    }

    const updateData: any = {};
    const canPersistGradient = supportsAssistantGradientFields();
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (canPersistGradient && data.bgFrom !== undefined)
      updateData.bgFrom = data.bgFrom;
    if (canPersistGradient && data.bgVia !== undefined)
      updateData.bgVia = data.bgVia;
    if (canPersistGradient && data.bgTo !== undefined)
      updateData.bgTo = data.bgTo;
    if (canPersistGradient && data.bgFromDark !== undefined)
      updateData.bgFromDark = data.bgFromDark;
    if (canPersistGradient && data.bgViaDark !== undefined)
      updateData.bgViaDark = data.bgViaDark;
    if (canPersistGradient && data.bgToDark !== undefined)
      updateData.bgToDark = data.bgToDark;
    if (data.systemPrompt !== undefined)
      updateData.systemPrompt = data.systemPrompt;
    if (data.temperature !== undefined)
      updateData.temperature = data.temperature;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.defaultModelId !== undefined) {
      updateData.defaultModelId = data.defaultModelId;
    }
    if (data.suggestedPrompts !== undefined)
      updateData.suggestedPrompts =
        data.suggestedPrompts === null
          ? Prisma.JsonNull
          : data.suggestedPrompts;

    let updated: any;
    try {
      updated = await prisma.assistant.update({
        where: { id: assistantId },
        data: updateData,
        select: assistantSelectWithModel,
      });
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;
      const {
        bgFrom: _bgFrom,
        bgVia: _bgVia,
        bgTo: _bgTo,
        bgFromDark: _bgFromDark,
        bgViaDark: _bgViaDark,
        bgToDark: _bgToDark,
        ...legacyUpdateData
      } = updateData;
      updated = await prisma.assistant.update({
        where: { id: assistantId },
        data: legacyUpdateData,
        select: assistantSelectWithModel,
      });
    }

    return toPublicAssistant(updated);
  }

  async toggleActive(assistantId: number) {
    const assistant = await prisma.assistant.findFirst({
      where: { id: assistantId, isDeleted: false },
      select: { id: true, isActive: true },
    });
    if (!assistant) {
      throw new ApiError("Assistant not found", STATUS_CODES.NOT_FOUND);
    }

    let updated: any;
    try {
      updated = await prisma.assistant.update({
        where: { id: assistantId },
        data: { isActive: !assistant.isActive },
        select: assistantSelectWithModel,
      });
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;
      updated = await prisma.assistant.update({
        where: { id: assistantId },
        data: { isActive: !assistant.isActive },
        select: assistantSelectWithModel,
      });
    }

    return toPublicAssistant(updated);
  }

  async softDelete(assistantId: number) {
    const assistant = await prisma.assistant.findFirst({
      where: { id: assistantId, isDeleted: false },
      select: { id: true },
    });
    if (!assistant) {
      throw new ApiError("Assistant not found", STATUS_CODES.NOT_FOUND);
    }

    await prisma.assistant.update({
      where: { id: assistantId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { message: "Assistant deleted successfully" };
  }
}

export default AssistantService;

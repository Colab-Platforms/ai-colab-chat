import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { CreateModelBody, UpdateModelBody } from "./model.types.js";
import {
  getPaginationOptions,
  formatPaginationResponse,
} from "@/utils/paginationUtils.js";
import { buildPrismaQuery } from "prisma-qb";

class ModelService {
  async create(data: CreateModelBody) {
    const provider = await prisma.modelProvider.findFirst({
      where: { id: data.modelProviderId, isDeleted: false },
    });
    if (!provider)
      throw new ApiError("Model provider not found", STATUS_CODES.NOT_FOUND);

    const model = await prisma.model.create({
      data,
      include: { modelProvider: { select: { id: true, name: true } } },
    });

    return model;
  }

  async list(query: any) {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 10);

    const { where, orderBy } = buildPrismaQuery({
      query,
      searchFields: [{ field: "name" }, { field: "externalId" }],
      filterFields: [
        { key: "isActive", field: "isActive", type: "boolean" },
        { key: "modelProviderId", field: "modelProviderId", type: "number" },
      ],
      sortFields: [
        { key: "name", field: "name" },
        { key: "createdAt", field: "createdAt" },
        { key: "isActive", field: "isActive" },
      ],
      defaultSort: { key: "createdAt", order: "desc" },
      softDelete: { field: "isDeleted", value: false },
      allowedQueryKeys: ["page", "pageSize", "capability"],
    });

    // Array-contains filter — buildPrismaQuery's generic filterFields do
    // equality only, so this one is applied by hand.
    const finalWhere = query.capability
      ? { ...where, capabilities: { has: query.capability } }
      : where;

    const [models, totalRecords] = await Promise.all([
      prisma.model.findMany({
        where: finalWhere,
        skip,
        take,
        orderBy,
        include: { modelProvider: { select: { id: true, name: true } } },
      }),
      prisma.model.count({ where: finalWhere }),
    ]);

    return formatPaginationResponse(models, totalRecords, page, pageSize);
  }

  async getById(modelId: number) {
    const model = await prisma.model.findFirst({
      where: { id: modelId, isDeleted: false },
      include: { modelProvider: { select: { id: true, name: true } } },
    });
    if (!model) throw new ApiError("Model not found", STATUS_CODES.NOT_FOUND);
    return model;
  }

  async update(modelId: number, data: UpdateModelBody) {
    const model = await prisma.model.findFirst({
      where: { id: modelId, isDeleted: false },
    });
    if (!model) throw new ApiError("Model not found", STATUS_CODES.NOT_FOUND);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.modelProviderId !== undefined)
      updateData.modelProvider = { connect: { id: data.modelProviderId } };
    if (data.externalId !== undefined) updateData.externalId = data.externalId;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.defaultForCapabilities !== undefined)
      updateData.defaultForCapabilities = data.defaultForCapabilities;
    if (data.capabilities !== undefined)
      updateData.capabilities = data.capabilities;
    if (data.tokenMultiplier !== undefined)
      updateData.tokenMultiplier = data.tokenMultiplier;
    if (data.videoCostPerSecond !== undefined)
      updateData.videoCostPerSecond = data.videoCostPerSecond;
    if (data.creditCostPerSecond !== undefined)
      updateData.creditCostPerSecond = data.creditCostPerSecond;

    const updated = await prisma.model.update({
      where: { id: modelId },
      data: updateData,
      include: { modelProvider: { select: { id: true, name: true } } },
    });
    return updated;
  }

  async softDelete(modelId: number) {
    const model = await prisma.model.findFirst({
      where: { id: modelId, isDeleted: false },
    });
    if (!model) throw new ApiError("Model not found", STATUS_CODES.NOT_FOUND);

    await prisma.model.update({
      where: { id: modelId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { message: "Model deleted successfully" };
  }
}

export default ModelService;

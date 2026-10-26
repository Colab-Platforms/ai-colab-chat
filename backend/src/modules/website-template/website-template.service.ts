import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";

/** The recommended model travels with the template so the composer can preselect it. */
const withModel = { model: { select: { id: true, name: true } } };

class WebsiteTemplateService {
  /**
   * `includeInactive` is for the admin screen only; the composer gallery never
   * sees hidden templates. Ordered by the admin's sortOrder, then most used.
   */
  async list(opts: { includeInactive?: boolean } = {}) {
    return prisma.websiteTemplate.findMany({
      where: {
        isDeleted: false,
        ...(opts.includeInactive ? {} : { isActive: true }),
      },
      include: withModel,
      orderBy: [{ sortOrder: "asc" }, { usageCount: "desc" }, { id: "desc" }],
    });
  }

  async create(data: {
    name: string;
    description: string;
    previewUrl: string;
    thumbnailUrl: string;
    techStack?: string[];
    prompt: string;
    modelId?: number | null;
    category?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.websiteTemplate.create({
      data: {
        ...data,
        techStack: data.techStack ?? [],
        category: data.category || null,
        modelId: data.modelId ?? null,
      },
      include: withModel,
    });
  }

  async update(id: number, data: Record<string, unknown>) {
    const existing = await prisma.websiteTemplate.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new ApiError("Template not found", STATUS_CODES.NOT_FOUND);
    return prisma.websiteTemplate.update({
      where: { id },
      data: {
        ...data,
        ...("category" in data ? { category: (data.category as string) || null } : {}),
        ...("modelId" in data ? { modelId: (data.modelId as number) ?? null } : {}),
      },
      include: withModel,
    });
  }

  async remove(id: number) {
    const existing = await prisma.websiteTemplate.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new ApiError("Template not found", STATUS_CODES.NOT_FOUND);
    await prisma.websiteTemplate.update({ where: { id }, data: { isDeleted: true, isActive: false } });
    return { id };
  }

  /** Popularity signal for ordering; best-effort, never blocks a build. */
  async recordUse(id: number) {
    await prisma.websiteTemplate.updateMany({
      where: { id, isDeleted: false },
      data: { usageCount: { increment: 1 } },
    });
    return { id };
  }

  /**
   * The design brief for a chat's template, or null when the chat was not
   * started from one (or the template has since been removed).
   */
  async findBriefSource(id: number) {
    return prisma.websiteTemplate.findFirst({
      where: { id, isDeleted: false },
      select: { name: true, description: true, techStack: true, prompt: true },
    });
  }
}

export default WebsiteTemplateService;

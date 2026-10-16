import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";

type TemplateType = "IMAGE" | "VIDEO";

class StudioTemplateService {
  /**
   * `includeInactive` is for the admin screen only; the studios never see
   * hidden templates. Ordered by the admin's sortOrder, then most used.
   */
  async list(opts: { type?: TemplateType; includeInactive?: boolean }) {
    return prisma.studioTemplate.findMany({
      where: {
        isDeleted: false,
        ...(opts.includeInactive ? {} : { isActive: true }),
        ...(opts.type ? { type: opts.type } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { usageCount: "desc" }, { id: "desc" }],
    });
  }

  async create(data: {
    type: TemplateType;
    title: string;
    category?: string | null;
    prompt: string;
    previewUrl: string;
    previewVideoUrl?: string | null;
    aspectRatio?: string;
    duration?: number | null;
    requiresPhoto?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.studioTemplate.create({
      data: {
        ...data,
        category: data.category || null,
        previewVideoUrl: data.type === "VIDEO" ? data.previewVideoUrl || null : null,
        duration: data.type === "VIDEO" ? (data.duration ?? 5) : null,
      },
    });
  }

  async update(id: number, data: Record<string, unknown>) {
    const existing = await prisma.studioTemplate.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new ApiError("Template not found", STATUS_CODES.NOT_FOUND);
    return prisma.studioTemplate.update({
      where: { id },
      data: {
        ...data,
        ...("category" in data ? { category: (data.category as string) || null } : {}),
        ...("previewVideoUrl" in data ? { previewVideoUrl: (data.previewVideoUrl as string) || null } : {}),
      },
    });
  }

  async remove(id: number) {
    const existing = await prisma.studioTemplate.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new ApiError("Template not found", STATUS_CODES.NOT_FOUND);
    await prisma.studioTemplate.update({ where: { id }, data: { isDeleted: true, isActive: false } });
    return { id };
  }

  /** Popularity signal for ordering; best-effort, never blocks generation. */
  async recordUse(id: number) {
    await prisma.studioTemplate.updateMany({
      where: { id, isDeleted: false },
      data: { usageCount: { increment: 1 } },
    });
    return { id };
  }
}

export default StudioTemplateService;

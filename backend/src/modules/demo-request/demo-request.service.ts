import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import {
  formatPaginationResponse,
  getPaginationOptions,
} from "@/utils/paginationUtils.js";

type Status = "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";

class DemoRequestService {
  async create(
    data: {
      name: string;
      email: string;
      phone?: string | null;
      company: string;
      teamSize: string;
      features: string[];
      models: string[];
      message?: string | null;
    },
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const created = await prisma.demoRequest.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        company: data.company,
        teamSize: data.teamSize,
        features: data.features,
        models: data.models,
        message: data.message || null,
        // The form only submits with consent ticked (validated upstream).
        consentAt: new Date(),
        ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
      select: { id: true },
    });
    return created;
  }

  async list(query: { page?: number; pageSize?: number; status?: Status; search?: string }) {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 20);
    const search = query.search?.trim();

    const where = {
      isDeleted: false,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { company: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total, counts] = await Promise.all([
      prisma.demoRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.demoRequest.count({ where }),
      prisma.demoRequest.groupBy({
        by: ["status"],
        where: { isDeleted: false },
        _count: { _all: true },
      }),
    ]);

    return {
      ...formatPaginationResponse(items, total, page, pageSize),
      // Per-status totals for the filter tabs, regardless of the current filter.
      statusCounts: Object.fromEntries(counts.map((c: { status: string; _count: { _all: number } }) => [c.status, c._count._all])),
    };
  }

  async update(id: number, data: { status?: Status; adminNotes?: string | null }) {
    const existing = await prisma.demoRequest.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new ApiError("Demo request not found", STATUS_CODES.NOT_FOUND);
    return prisma.demoRequest.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...("adminNotes" in data ? { adminNotes: data.adminNotes || null } : {}),
      },
    });
  }

  async remove(id: number) {
    const existing = await prisma.demoRequest.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new ApiError("Demo request not found", STATUS_CODES.NOT_FOUND);
    await prisma.demoRequest.update({ where: { id }, data: { isDeleted: true } });
    return { id };
  }
}

export default DemoRequestService;

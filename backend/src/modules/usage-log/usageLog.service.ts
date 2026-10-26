import prisma from "@root/prisma.js";
import { Prisma } from "@prisma/client";
import {
  getPaginationOptions,
  formatPaginationResponse,
} from "@/utils/paginationUtils.js";
import { buildPrismaQuery } from "prisma-qb";

class UsageLogService {
  async list(query: any, callerRole: string = "USER") {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 10);

    const { where: qbWhere, orderBy } = buildPrismaQuery({
      query,
      searchFields: [
        { field: "firstName", model: "user" },
        { field: "lastName", model: "user" },
        { field: "email", model: "user" },
      ],
      filterFields: [
        { key: "userId", field: "userId", type: "number" },
        { key: "modelId", field: "modelId", type: "number" },
        { key: "chatId", field: "chatId", type: "number" },
        { key: "createdAt", field: "createdAt", type: "date" },
      ],
      sortFields: [
        { key: "createdAt", field: "createdAt" },
        { key: "totalTokens", field: "totalTokens" },
        { key: "promptTokens", field: "promptTokens" },
        { key: "completionTokens", field: "completionTokens" },
        { key: "billableTotalTokens", field: "billableTotalTokens" },
        { key: "billablePromptTokens", field: "billablePromptTokens" },
        { key: "billableCompletionTokens", field: "billableCompletionTokens" },
      ],
      defaultSort: { key: "createdAt", order: "desc" },
      allowedQueryKeys: ["page", "pageSize"],
    });

    const where: any = { ...qbWhere };

    // Hide SuperAdmin logs from standard Admins and Users
    if (callerRole !== "SUPERADMIN" && callerRole !== "SUPER_ADMIN") {
      where.user = {
        userRoles: {
          none: {
            role: { name: { in: ["SUPERADMIN", "SUPER_ADMIN"] } },
          },
        },
      };
    }

    // 1. Get the distinct group IDs for pagination
    const groupIdentifiers = await prisma.usageLog.findMany({
      where,
      skip,
      take,
      distinct: ['groupId'],
      orderBy,
      select: { groupId: true },
    });

    const groupsToFetch = groupIdentifiers.map((g) => g.groupId).filter(Boolean) as string[];

    // 2. Fetch all components of those specific groups in 1 query
    const rawLogs = await prisma.usageLog.findMany({
      where: {
        ...where,
        groupId: { in: groupsToFetch },
      },
      orderBy,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        model: { select: { id: true, name: true } },
      },
    });

    const grouped = new Map<string, any>();
    for (const log of rawLogs) {
      if (!log.groupId) continue; // Should not happen after backfill
      
      if (!grouped.has(log.groupId)) {
        grouped.set(log.groupId, {
          id: log.groupId,
          user: log.user,
          messageId: log.messageId,
          capability: log.capability,
          createdAt: log.createdAt,
          models: [],
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          billablePromptTokens: 0,
          billableCompletionTokens: 0,
          billableTotalTokens: 0,
          subLogs: [],
        });
      }

      const group = grouped.get(log.groupId);
      if (log.model) group.models.push(log.model);
      group.promptTokens += (log.promptTokens || 0);
      group.completionTokens += (log.completionTokens || 0);
      group.totalTokens += (log.totalTokens || 0);
      group.billablePromptTokens += (log.billablePromptTokens || 0);
      group.billableCompletionTokens += (log.billableCompletionTokens || 0);
      group.billableTotalTokens += (log.billableTotalTokens || 0);
      group.subLogs.push(log);
    }

    // Preserve sorting
    let paginatedLogs = groupsToFetch.map((g) => grouped.get(g)).filter(Boolean);

    // Plain users only ever see billable tokens; raw provider counts stay admin-only.
    if (callerRole === "USER") {
      const stripActual = ({ promptTokens, completionTokens, totalTokens, ...rest }: any) => rest;
      paginatedLogs = paginatedLogs.map((g) => ({
        ...stripActual(g),
        subLogs: g.subLogs.map(stripActual),
      }));
    }

    // Get total distinct groups reliably
    const distinctGroups = await prisma.usageLog.groupBy({ by: ['groupId'], where });
    const totalRecords = distinctGroups.length;

    return formatPaginationResponse(paginatedLogs, totalRecords, page, pageSize);
  }

  /** Billable tokens logged per calendar day (UTC) per model, for charts. */
  async getDailyTokensByModel(userId: number, days: number) {
    const safeDays = Math.min(Math.max(Math.floor(days), 1), 90);
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (safeDays - 1));

    const rows = await prisma.$queryRaw<
      Array<{
        day: Date;
        modelId: number;
        modelName: string;
        tokens: bigint;
      }>
    >(Prisma.sql`
      SELECT
        (ul."createdAt" AT TIME ZONE 'UTC')::date AS day,
        ul."modelId",
        m.name AS "modelName",
        COALESCE(SUM(ul."billableTotalTokens"), 0)::bigint AS tokens
      FROM "UsageLog" ul
      INNER JOIN "Model" m ON m.id = ul."modelId"
      WHERE ul."userId" = ${userId}
        AND ul."createdAt" >= ${from}
      GROUP BY (ul."createdAt" AT TIME ZONE 'UTC')::date, ul."modelId", m.name
      ORDER BY day ASC, m.name ASC
    `);

    return rows.map((r) => {
      const day =
        r.day instanceof Date
          ? r.day.toISOString().slice(0, 10)
          : String(r.day).slice(0, 10);
      return {
        day,
        modelId: r.modelId,
        modelName: r.modelName,
        tokens: Number(r.tokens),
      };
    });
  }
}

export default UsageLogService;

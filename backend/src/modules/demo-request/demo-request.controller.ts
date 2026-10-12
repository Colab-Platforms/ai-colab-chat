import { Request, Response } from "express";
import ExcelJS from "exceljs";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import DemoRequestService from "./demo-request.service.js";
import {
  validateCreateDemoRequest,
  validateListDemoRequests,
  validateUpdateDemoRequest,
} from "./demo-request.validators.js";

const service = new DemoRequestService();

const fail = (res: Response, label: string, error: any) => {
  console.error(label, error);
  sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
};

/**
 * Public, unauthenticated endpoint, so it defends itself: a hidden honeypot
 * field plus a small per-IP limit. (No rate-limit package is installed; this
 * in-memory window is per server process, which is enough to blunt a bot.)
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

const tooManyRequests = (ip: string): boolean => {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map from growing without bound.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
};

export const createDemoRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    // A filled honeypot is a bot: answer success so it learns nothing, store nothing.
    if (typeof req.body?.website === "string" && req.body.website.length > 0) {
      sendResponse(res, true, { id: 0 }, "Request received", STATUS_CODES.CREATED);
      return;
    }

    const { error, value } = validateCreateDemoRequest(req.body);
    if (error) {
      sendResponse(res, false, error.details.map((d) => d.message), error.details[0].message, STATUS_CODES.BAD_REQUEST);
      return;
    }

    if (tooManyRequests(ip)) {
      sendResponse(res, false, null, "Too many requests. Please try again later.", 429);
      return;
    }

    const created = await service.create(value, {
      ipAddress: ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    sendResponse(res, true, created, "Request received", STATUS_CODES.CREATED);
  } catch (error) {
    fail(res, "Create demo request error", error);
  }
};

export const listDemoRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateListDemoRequests(req.query);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.list(value), "Demo requests fetched", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "List demo requests error", error);
  }
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CLOSED: "Closed",
};

export const exportDemoRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateListDemoRequests(req.query);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const rows = await service.exportAll(value);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Demo requests");
    sheet.columns = [
      { header: "Received", key: "createdAt", width: 20 },
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Company", key: "company", width: 26 },
      { header: "Team size", key: "teamSize", width: 12 },
      { header: "Features needed", key: "features", width: 36 },
      { header: "AI models", key: "models", width: 36 },
      { header: "Message", key: "message", width: 48 },
      { header: "Status", key: "status", width: 14 },
      { header: "Internal notes", key: "adminNotes", width: 40 },
    ];
    for (const r of rows) {
      sheet.addRow({
        createdAt: r.createdAt,
        name: r.name,
        email: r.email,
        phone: r.phone ?? "",
        company: r.company,
        // Stored as text so Excel doesn't turn "11–50" into a date.
        teamSize: r.teamSize,
        features: (r.features as string[]).join(", "),
        models: (r.models as string[]).join(", "),
        message: r.message ?? "",
        status: STATUS_LABELS[r.status] ?? r.status,
        adminNotes: r.adminNotes ?? "",
      });
    }
    sheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm";
    sheet.getColumn("phone").numFmt = "@";
    sheet.getColumn("teamSize").numFmt = "@";
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "K1" };
    sheet.eachRow((row, n) => {
      if (n > 1) row.alignment = { vertical: "top", wrapText: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="demo-requests-${stamp}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    fail(res, "Export demo requests error", error);
  }
};

export const updateDemoRequest =async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateUpdateDemoRequest(req.body);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.update(Number(req.params.id), value), "Demo request updated", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Update demo request error", error);
  }
};

export const deleteDemoRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.remove(Number(req.params.id)), "Demo request deleted", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Delete demo request error", error);
  }
};

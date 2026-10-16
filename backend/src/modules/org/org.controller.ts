import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import OrgService from "./org.service.js";
import OrgInviteService from "./org.invite.service.js";
import OrgBillingService from "./org.billing.service.js";
import OrgReportsService, { resolveRange } from "./org.reports.service.js";
import {
  validateAcceptInvite,
  validateCreateRole,
  validateInviteMembers,
  validateUpdateMember,
  validateTopUp,
  validateTransferOwnership,
  validateUpdateSettings,
  validateUpdateRole,
} from "./org.validators.js";

const service = new OrgService();
const inviteService = new OrgInviteService();
const billing = new OrgBillingService();
const reports = new OrgReportsService();

const fail = (res: Response, label: string, error: any) => {
  console.error(label, error);
  sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
};

const bad = (res: Response, error: { details: { message: string }[] }) =>
  sendResponse(res, false, error.details.map((d) => d.message), error.details[0].message, STATUS_CODES.BAD_REQUEST);

const actor = (req: Request) => ({
  userId: req.user!.id,
  orgId: req.org!.orgId,
  memberRole: req.org!.memberRole,
  ip: req.ip,
});

const idParam = (req: Request, name = "id") => parseInt(req.params[name] as string, 10);

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.getMe(req.user!.id, req.org!.orgId), "Organization fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Org me error", e);
  }
};

export const listMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, roleId, search } = req.query as Record<string, string | undefined>;
    const data = await service.listMembers(req.org!.orgId, {
      status: ["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"].includes(status ?? "") ? status : undefined,
      roleId: roleId ? parseInt(roleId, 10) || undefined : undefined,
      search,
    });
    sendResponse(res, true, data, "Members fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "List members error", e);
  }
};

export const updateMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateUpdateMember(req.body);
    if (error) return void bad(res, error);
    sendResponse(res, true, await service.updateMember(actor(req), idParam(req), value), "Member updated", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Update member error", e);
  }
};

export const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    await service.removeMember(actor(req), idParam(req));
    sendResponse(res, true, null, "Member removed", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Remove member error", e);
  }
};

export const topUpMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateTopUp(req.body);
    if (error) return void bad(res, error);
    sendResponse(res, true, await service.topUpMember(actor(req), idParam(req), value.tokens), "Tokens added", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Top-up member error", e);
  }
};

export const getMemberUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? "30"), 10) || 30));
    sendResponse(res, true, await service.getMemberUsage(req.org!.orgId, idParam(req), days), "Usage fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Member usage error", e);
  }
};

export const listInvites = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.listInvites(req.org!.orgId), "Invites fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "List invites error", e);
  }
};

export const createInvites = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateInviteMembers(req.body);
    if (error) return void bad(res, error);
    sendResponse(res, true, await service.createInvites(actor(req), value.invites), "Invites processed", STATUS_CODES.CREATED);
  } catch (e) {
    fail(res, "Create invites error", e);
  }
};

export const revokeInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    await service.revokeInvite(actor(req), idParam(req));
    sendResponse(res, true, null, "Invite revoked", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Revoke invite error", e);
  }
};

export const listRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.listRoles(req.org!.orgId), "Roles fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "List roles error", e);
  }
};

export const createRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateCreateRole(req.body);
    if (error) return void bad(res, error);
    sendResponse(res, true, await service.createRole(actor(req), value), "Role created", STATUS_CODES.CREATED);
  } catch (e) {
    fail(res, "Create role error", e);
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateUpdateRole(req.body);
    if (error) return void bad(res, error);
    sendResponse(res, true, await service.updateRole(actor(req), idParam(req), value), "Role updated", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Update role error", e);
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    await service.deleteRole(actor(req), idParam(req));
    sendResponse(res, true, null, "Role deleted", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Delete role error", e);
  }
};

// Public (token is the credential)
export const previewInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await inviteService.preview(req.params.token as string), "Invite fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Preview invite error", e);
  }
};

export const acceptInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateAcceptInvite(req.body);
    if (error) return void bad(res, error);
    sendResponse(res, true, await inviteService.accept(req.params.token as string, value), "Account created", STATUS_CODES.CREATED);
  } catch (e) {
    fail(res, "Accept invite error", e);
  }
};

// ── Billing (owner only) ────────────────────────────────────────────────────
const seatsQuery = (v: unknown) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null;
};

export const getBilling = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await billing.getOverview(req.org!.orgId), "Billing fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Get billing error", e);
  }
};

export const previewSeats = async (req: Request, res: Response): Promise<void> => {
  try {
    const seats = seatsQuery(req.query.seats);
    if (!seats) return void sendResponse(res, false, null, "seats must be a whole number", STATUS_CODES.BAD_REQUEST);
    sendResponse(res, true, await billing.previewSeatChange(req.org!.orgId, seats), "Preview ready", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Preview seats error", e);
  }
};

export const changeSeats = async (req: Request, res: Response): Promise<void> => {
  try {
    const seats = seatsQuery(req.body?.seats);
    if (!seats) return void sendResponse(res, false, null, "seats must be a whole number", STATUS_CODES.BAD_REQUEST);
    sendResponse(res, true, await billing.requestSeatChange(actor(req), seats), "Seat change recorded", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Change seats error", e);
  }
};

export const payBill = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await billing.startCashfreePayment(actor(req), idParam(req)), "Payment started", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Pay bill error", e);
  }
};

// ── Reports, audit, settings (admins) ───────────────────────────────────────
const daysQuery = (v: unknown, fallback = 30) => Math.min(365, Math.max(1, parseInt(String(v ?? ""), 10) || fallback));

export const getOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await reports.overview(req.org!.orgId), "Overview fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Org overview error", e);
  }
};

export const getUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await reports.usage(req.org!.orgId, resolveRange(daysQuery(req.query.days))), "Usage fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Org usage error", e);
  }
};

export const exportUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = daysQuery(req.query.days);
    const csv = await reports.usageCsv(req.org!.orgId, resolveRange(days));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="usage-last-${days}-days.csv"`);
    res.status(200).send(csv);
  } catch (e) {
    fail(res, "Org usage export error", e);
  }
};

export const getAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const action = typeof req.query.action === "string" && req.query.action ? req.query.action.slice(0, 60) : undefined;
    sendResponse(res, true, await reports.audit(req.org!.orgId, { page, action }), "Audit log fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Org audit error", e);
  }
};

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await reports.getSettings(req.org!.orgId), "Settings fetched", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Org settings error", e);
  }
};

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateUpdateSettings(req.body);
    if (error) return void bad(res, error);
    const a = actor(req);
    sendResponse(res, true, await reports.updateSettings({ userId: a.userId, orgId: a.orgId, ip: a.ip }, value), "Settings saved", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Update org settings error", e);
  }
};

export const transferOwnership = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateTransferOwnership(req.body);
    if (error) return void bad(res, error);
    const a = actor(req);
    await reports.transferOwnership({ userId: a.userId, orgId: a.orgId, ip: a.ip }, value.memberId);
    sendResponse(res, true, null, "Ownership transferred", STATUS_CODES.OK);
  } catch (e) {
    fail(res, "Transfer ownership error", e);
  }
};

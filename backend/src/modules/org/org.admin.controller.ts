import { Request, Response } from "express";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import OrgAdminService from "./org.admin.service.js";
import { validateCreateOrg, validateListOrgs, validateSetOrgStatus } from "./org.validators.js";

const service = new OrgAdminService();

const fail = (res: Response, label: string, error: any) => {
  console.error(label, error);
  sendResponse(res, false, null, error.message, error.statusCode ?? STATUS_CODES.SERVER_ERROR);
};

const orgId = (req: Request) => parseInt(req.params.id as string, 10);

export const createOrg = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateCreateOrg(req.body);
    if (error) {
      sendResponse(res, false, error.details.map((d) => d.message), error.details[0].message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    const result = await service.create(value, req.user!.id);
    sendResponse(res, true, result, "Organization created", STATUS_CODES.CREATED);
  } catch (error) {
    fail(res, "Create org error", error);
  }
};

export const listOrgs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateListOrgs(req.query);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.list(value), "Organizations fetched", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "List orgs error", error);
  }
};

export const getOrg = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.getById(orgId(req)), "Organization fetched", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Get org error", error);
  }
};

export const setOrgStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = validateSetOrgStatus(req.body);
    if (error) {
      sendResponse(res, false, null, error.message, STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.setStatus(orgId(req), value.status, req.user!.id), "Organization updated", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Set org status error", error);
  }
};

export const closeOrg = async (req: Request, res: Response): Promise<void> => {
  try {
    // Irreversible, so the caller must echo the organization's id.
    if (Number(req.body?.confirmOrgId) !== orgId(req)) {
      sendResponse(res, false, null, "Confirmation does not match this organization", STATUS_CODES.BAD_REQUEST);
      return;
    }
    sendResponse(res, true, await service.closeOrg(orgId(req), req.user!.id), "Organization closed", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Close org error", error);
  }
};

export const listOrgBills = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(res, true, await service.listBills(orgId(req)), "Invoices fetched", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "List org bills error", error);
  }
};

export const markOrgBillPaid = async (req: Request, res: Response): Promise<void> => {
  try {
    const reference = String(req.body?.reference ?? "").trim().slice(0, 100);
    if (!reference) {
      sendResponse(res, false, null, "A payment reference (e.g. UTR) is required", STATUS_CODES.BAD_REQUEST);
      return;
    }
    const billId = parseInt(req.params.billId as string, 10);
    sendResponse(res, true, await service.markBillPaid(orgId(req), billId, reference, req.user!.id), "Invoice marked paid", STATUS_CODES.OK);
  } catch (error) {
    fail(res, "Mark org bill paid error", error);
  }
};

export const activateOrgSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    sendResponse(
      res,
      true,
      await service.activateSubscription(orgId(req), req.user!.id),
      "Subscription activated",
      STATUS_CODES.OK,
    );
  } catch (error) {
    fail(res, "Activate org subscription error", error);
  }
};

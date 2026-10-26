import Joi from "joi";

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(200);

export const createOrgSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).required(),
  gstin: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
    .allow("", null)
    .messages({ "string.pattern.base": "GSTIN is not valid" }),
  billingEmail: email.required(),
  billingAddress: Joi.object().unknown(true).allow(null),
  ownerEmail: email.required(),
  // false = the owner only manages the org (no seat, no org tokens).
  ownerTakesSeat: Joi.boolean().default(true),
  allowedEmailDomains: Joi.array()
    .items(Joi.string().trim().lowercase().pattern(/^[a-z0-9.-]+\.[a-z]{2,}$/))
    .max(20)
    .default([]),
  demoRequestId: Joi.number().integer().positive().allow(null),
  billingMode: Joi.string().valid("CASHFREE", "MANUAL_INVOICE").required(),
  billingCycle: Joi.string().valid("MONTHLY", "QUARTERLY", "YEARLY").default("MONTHLY"),
  seats: Joi.number().integer().min(1).max(100000).required(),
  minSeats: Joi.number().integer().min(1).max(100000).default(1),
  pricePerSeat: Joi.number().min(0).required(),
  // First role created with the org; the org admin edits/adds roles later.
  defaultRole: Joi.object({
    name: Joi.string().trim().min(1).max(60).default("Member"),
    monthlyTokens: Joi.number().integer().min(0).default(0),
    monthlyVideoCredits: Joi.number().integer().min(0).default(0),
  }).default({}),
});

export const listOrgsSchema = Joi.object({
  page: Joi.number().integer().min(1),
  pageSize: Joi.number().integer().min(1).max(100),
  status: Joi.string().valid("ACTIVE", "SUSPENDED", "CLOSED"),
  search: Joi.string().trim().max(100).allow(""),
});

export const setOrgStatusSchema = Joi.object({
  status: Joi.string().valid("ACTIVE", "SUSPENDED").required(),
});

export const validateCreateOrg = (data: unknown) =>
  createOrgSchema.validate(data, { abortEarly: false, stripUnknown: true });
export const validateListOrgs = (data: unknown) =>
  listOrgsSchema.validate(data, { stripUnknown: true });
export const validateSetOrgStatus = (data: unknown) => setOrgStatusSchema.validate(data);

// ── Org console (Phase 2) ───────────────────────────────────────────────────

const modelPolicy = Joi.object({
  mode: Joi.string().valid("ALL", "ALLOWLIST", "BLOCKLIST").required(),
  modelIds: Joi.array().items(Joi.number().integer().positive()).max(500).default([]),
});

const roleFields = {
  name: Joi.string().trim().min(1).max(60),
  description: Joi.string().trim().max(300).allow("", null),
  isDefault: Joi.boolean(),
  monthlyTokens: Joi.number().integer().min(0).max(2_000_000_000),
  monthlyVideoCredits: Joi.number().integer().min(0).max(1_000_000),
  imageGenEnabled: Joi.boolean(),
  documentGenEnabled: Joi.boolean(),
  videoGenEnabled: Joi.boolean(),
  codeWorkspaceEnabled: Joi.boolean(),
  voiceEnabled: Joi.boolean(),
  modelPolicy,
  videoModelIds: Joi.array().items(Joi.number().integer().positive()).max(100),
  dailyTokenCap: Joi.number().integer().min(1).allow(null),
  perRequestTokenCap: Joi.number().integer().min(1).allow(null),
};

export const createRoleSchema = Joi.object({ ...roleFields, name: roleFields.name.required() });
// applyNow: also move current balances of this role's active members by the quota change.
export const updateRoleSchema = Joi.object({ ...roleFields, applyNow: Joi.boolean() }).min(1);

export const topUpSchema = Joi.object({
  tokens: Joi.number().integer().min(1).max(100_000_000).required(),
});

export const inviteMembersSchema = Joi.object({
  invites: Joi.array()
    .items(
      Joi.object({
        email: email.required(),
        orgRoleId: Joi.number().integer().positive().required(),
        memberRole: Joi.string().valid("ADMIN", "MEMBER").default("MEMBER"),
        // Admins only: false = manage-only, no seat used.
        takesSeat: Joi.boolean().default(true),
      }),
    )
    .min(1)
    .max(200)
    .required(),
});

export const updateMemberSchema = Joi.object({
  orgRoleId: Joi.number().integer().positive(),
  memberRole: Joi.string().valid("OWNER", "ADMIN", "MEMBER"),
  status: Joi.string().valid("ACTIVE", "SUSPENDED"),
  takesSeat: Joi.boolean(),
}).min(1);

export const acceptInviteSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(60).required(),
  lastName: Joi.string().trim().min(1).max(60).required(),
  password: Joi.string().min(8).max(128).required(),
});

export const validateCreateRole = (d: unknown) => createRoleSchema.validate(d, { abortEarly: false, stripUnknown: true });
export const validateUpdateRole = (d: unknown) => updateRoleSchema.validate(d, { abortEarly: false, stripUnknown: true });
export const validateInviteMembers = (d: unknown) => inviteMembersSchema.validate(d, { abortEarly: false, stripUnknown: true });
export const validateUpdateMember = (d: unknown) => updateMemberSchema.validate(d, { stripUnknown: true });
export const validateTopUp = (d: unknown) => topUpSchema.validate(d, { stripUnknown: true });
export const validateAcceptInvite = (d: unknown) => acceptInviteSchema.validate(d, { stripUnknown: true });

// ── Settings (Phase 5) ──────────────────────────────────────────────────────
export const updateSettingsSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150),
  gstin: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
    .allow("", null)
    .messages({ "string.pattern.base": "GSTIN is not valid" }),
  billingEmail: email,
  billingAddress: Joi.object({
    line1: Joi.string().trim().max(200).allow(""),
    line2: Joi.string().trim().max(200).allow(""),
    city: Joi.string().trim().max(100).allow(""),
    state: Joi.string().trim().max(100).allow(""),
    pincode: Joi.string().trim().max(12).allow(""),
  }).allow(null),
  allowedEmailDomains: Joi.array()
    .items(Joi.string().trim().lowercase().pattern(/^[a-z0-9.-]+\.[a-z]{2,}$/))
    .max(20),
}).min(1);

export const transferOwnershipSchema = Joi.object({ memberId: Joi.number().integer().positive().required() });

export const validateUpdateSettings = (d: unknown) => updateSettingsSchema.validate(d, { abortEarly: false, stripUnknown: true });
export const validateTransferOwnership = (d: unknown) => transferOwnershipSchema.validate(d);

/**
 * Master switch for the enterprise/org feature (see ENTERPRISE_ORG_PLAN.md).
 * Off by default: with it off, no org table is ever queried on a request path
 * and behavior is identical to before orgs existed.
 */
export const isEnterpriseEnabled = (): boolean =>
  process.env.ENTERPRISE_ENABLED === "true";

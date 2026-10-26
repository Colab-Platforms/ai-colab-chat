export interface OrgModelPolicyLike {
  mode: "ALL" | "ALLOWLIST" | "BLOCKLIST";
  modelIds: number[];
}

/** Whether a role's model policy lets its members use this model. */
export function isModelAllowed(policy: { modelPolicy: OrgModelPolicyLike }, modelId: number): boolean {
  const { mode, modelIds } = policy.modelPolicy;
  if (mode === "ALLOWLIST") return modelIds.includes(modelId);
  if (mode === "BLOCKLIST") return !modelIds.includes(modelId);
  return true;
}

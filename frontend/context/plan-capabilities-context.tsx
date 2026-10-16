"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { subscriptionService, orgService } from "@/lib/services";
import { useAuth } from "@/context/auth-context";

interface PlanCapabilities {
  planName: string | null;
  restrictToFreeModels: boolean;
  documentGenEnabled: boolean;
  imageGenEnabled: boolean;
  videoGenEnabled: boolean;
  monthlyVideoCredits: number;
  // Enterprise seats: capabilities come from the org role instead of a plan.
  codeWorkspaceEnabled: boolean;
  voiceEnabled: boolean;
  org: { name: string; roleName: string; active: boolean } | null;
  orgModelPolicy: { mode: "ALL" | "ALLOWLIST" | "BLOCKLIST"; modelIds: number[] } | null;
  /** True when this model can't be picked (plan free-only limit, or the org role's model policy). */
  isModelLocked: (model: { id: number; isFreeModel?: boolean }) => boolean;
  loading: boolean;
  refresh: () => void;
}

type CapState = Omit<PlanCapabilities, "refresh" | "isModelLocked">;

// Free-plan-shaped defaults used while loading and if the request fails,
// so a lock icon flickering to "unlocked" never happens: worst case a paid
// user briefly sees things as locked, never the other way around.
const DEFAULTS: CapState = {
  planName: null,
  restrictToFreeModels: true,
  documentGenEnabled: true,
  imageGenEnabled: false,
  videoGenEnabled: false,
  monthlyVideoCredits: 0,
  codeWorkspaceEnabled: true,
  voiceEnabled: true,
  org: null,
  orgModelPolicy: null,
  loading: true,
};

const PlanCapabilitiesContext = createContext<PlanCapabilities | undefined>(undefined);

export function PlanCapabilitiesProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const isOrgSeat = user?.orgMembership?.status === "ACTIVE" && user.orgMembership.takesSeat !== false;
  const [state, setState] = useState<CapState>(DEFAULTS);

  const fetchCapabilities = useCallback(async () => {
    if (!token) {
      setState({ ...DEFAULTS, loading: false });
      return;
    }
    try {
      if (isOrgSeat) {
        const org = (await orgService.me())?.data?.data;
        const c = org?.capabilities;
        if (org && c) {
          setState({
            planName: org.organization?.name ?? null,
            restrictToFreeModels: false,
            documentGenEnabled: c.documentGenEnabled !== false,
            imageGenEnabled: Boolean(c.imageGenEnabled),
            videoGenEnabled: Boolean(c.videoGenEnabled),
            monthlyVideoCredits: Number(c.monthlyVideoCredits ?? 0),
            codeWorkspaceEnabled: Boolean(c.codeWorkspaceEnabled),
            voiceEnabled: Boolean(c.voiceEnabled),
            org: {
              name: org.organization?.name ?? "",
              roleName: org.role?.name ?? "",
              active: Boolean(org.subscriptionActive),
            },
            orgModelPolicy: c.modelPolicy ?? null,
            loading: false,
          });
          return;
        }
      }
      const res = await subscriptionService.getCurrent();
      const plan = res?.data?.data?.subscription?.plan;
      if (!plan) {
        setState({ ...DEFAULTS, loading: false });
        return;
      }
      setState({
        planName: plan.name ?? null,
        restrictToFreeModels: Boolean(plan.restrictToFreeModels),
        documentGenEnabled: plan.documentGenEnabled !== false,
        imageGenEnabled: Boolean(plan.imageGenEnabled),
        videoGenEnabled: Boolean(plan.videoGenEnabled),
        monthlyVideoCredits: Number(plan.monthlyVideoCredits ?? 0),
        codeWorkspaceEnabled: true,
        voiceEnabled: true,
        org: null,
        orgModelPolicy: null,
        loading: false,
      });
    } catch {
      setState({ ...DEFAULTS, loading: false });
    }
  }, [token, isOrgSeat]);

  const isModelLocked = useCallback(
    (model: { id: number; isFreeModel?: boolean }) => {
      const policy = state.orgModelPolicy;
      if (policy) {
        if (policy.mode === "ALLOWLIST") return !policy.modelIds.includes(model.id);
        if (policy.mode === "BLOCKLIST") return policy.modelIds.includes(model.id);
        return false;
      }
      return state.restrictToFreeModels && !model.isFreeModel;
    },
    [state.orgModelPolicy, state.restrictToFreeModels],
  );

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities]);

  return (
    <PlanCapabilitiesContext.Provider value={{ ...state, isModelLocked, refresh: fetchCapabilities }}>
      {children}
    </PlanCapabilitiesContext.Provider>
  );
}

export function usePlanCapabilities() {
  const context = useContext(PlanCapabilitiesContext);
  if (!context) throw new Error("usePlanCapabilities must be used within PlanCapabilitiesProvider");
  return context;
}

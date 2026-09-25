"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { subscriptionService } from "@/lib/services";
import { useAuth } from "@/context/auth-context";

interface PlanCapabilities {
  planName: string | null;
  restrictToFreeModels: boolean;
  documentGenEnabled: boolean;
  imageGenEnabled: boolean;
  videoGenEnabled: boolean;
  monthlyVideoCredits: number;
  loading: boolean;
  refresh: () => void;
}

// Free-plan-shaped defaults — used while loading and if the request fails,
// so a lock icon flickering to "unlocked" never happens: worst case a paid
// user briefly sees things as locked, never the other way around.
const DEFAULTS: Omit<PlanCapabilities, "refresh"> = {
  planName: null,
  restrictToFreeModels: true,
  documentGenEnabled: true,
  imageGenEnabled: false,
  videoGenEnabled: false,
  monthlyVideoCredits: 0,
  loading: true,
};

const PlanCapabilitiesContext = createContext<PlanCapabilities | undefined>(undefined);

export function PlanCapabilitiesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [state, setState] = useState<Omit<PlanCapabilities, "refresh">>(DEFAULTS);

  const fetchCapabilities = useCallback(async () => {
    if (!token) {
      setState({ ...DEFAULTS, loading: false });
      return;
    }
    try {
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
        loading: false,
      });
    } catch {
      setState({ ...DEFAULTS, loading: false });
    }
  }, [token]);

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities]);

  return (
    <PlanCapabilitiesContext.Provider value={{ ...state, refresh: fetchCapabilities }}>
      {children}
    </PlanCapabilitiesContext.Provider>
  );
}

export function usePlanCapabilities() {
  const context = useContext(PlanCapabilitiesContext);
  if (!context) throw new Error("usePlanCapabilities must be used within PlanCapabilitiesProvider");
  return context;
}

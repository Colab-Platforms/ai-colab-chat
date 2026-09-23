import { useSyncExternalStore } from "react";

type RouteUiState = {
  activeChatId: number | null;
  isDraftRoute: boolean;
  isStarredRoute: boolean;
  isVoiceRoute: boolean;
  isAssetsRoute: boolean;
  isProjectsRoute: boolean;
};

const state: RouteUiState = {
  activeChatId: null,
  isDraftRoute: true,
  isStarredRoute: false,
  isVoiceRoute: false,
  isAssetsRoute: false,
  isProjectsRoute: false,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setRouteUiFromPathname(pathname: string) {
  const match = pathname.match(/^\/c\/(\d+)/);
  const parsed = match ? Number(match[1]) : NaN;
  const nextActiveChatId = Number.isNaN(parsed) ? null : parsed;
  const nextIsStarredRoute = pathname === "/starred";
  const nextIsVoiceRoute = pathname === "/voice";
  const nextIsAssetsRoute = pathname === "/assets";
  const nextIsProjectsRoute = pathname === "/projects";
  const nextIsDraftRoute = pathname === "/" || pathname === "/new";

  if (
    state.activeChatId === nextActiveChatId &&
    state.isDraftRoute === nextIsDraftRoute &&
    state.isStarredRoute === nextIsStarredRoute &&
    state.isVoiceRoute === nextIsVoiceRoute &&
    state.isAssetsRoute === nextIsAssetsRoute &&
    state.isProjectsRoute === nextIsProjectsRoute
  ) {
    return;
  }

  state.activeChatId = nextActiveChatId;
  state.isDraftRoute = nextIsDraftRoute;
  state.isStarredRoute = nextIsStarredRoute;
  state.isVoiceRoute = nextIsVoiceRoute;
  state.isAssetsRoute = nextIsAssetsRoute;
  state.isProjectsRoute = nextIsProjectsRoute;
  emit();
}

export function getRouteUiSnapshot(): Readonly<RouteUiState> {
  return state;
}

export function subscribeRouteUi(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsChatActive(chatId: number) {
  return useSyncExternalStore(
    subscribeRouteUi,
    () => state.activeChatId === chatId,
    () => false,
  );
}

export function useIsDraftRoute() {
  return useSyncExternalStore(subscribeRouteUi, () => state.isDraftRoute, () => true);
}

export function useIsStarredRoute() {
  return useSyncExternalStore(subscribeRouteUi, () => state.isStarredRoute, () => false);
}

export function useIsVoiceRoute() {
  return useSyncExternalStore(subscribeRouteUi, () => state.isVoiceRoute, () => false);
}

export function useIsAssetsRoute() {
  return useSyncExternalStore(subscribeRouteUi, () => state.isAssetsRoute, () => false);
}

export function useIsProjectsRoute() {
  return useSyncExternalStore(subscribeRouteUi, () => state.isProjectsRoute, () => false);
}


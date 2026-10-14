import api from "@/lib/api";

const STORAGE_KEY = "guest_token";
const COOKIE_NAME = "guest_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export interface GuestModel {
  id: number;
  name: string;
  externalId: string;
  description?: string | null;
}

export interface GuestConfig {
  singleMessages: number;
  multiMessages: number;
  maxCompareModels: number;
  /** Messages the visitor's IP still has, whether or not a session exists. */
  ipMessagesLeft: number;
  models: GuestModel[];
}

export interface GuestStatus {
  singleLeft: number;
  multiLeft: number;
}

const readCookie = () => {
  try {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE_NAME}=`));
    return match ? decodeURIComponent(match.split("=")[1]) : null;
  } catch {
    return null;
  }
};

/**
 * The token lives in localStorage and a first-party cookie, so clearing only
 * one of them doesn't hand the visitor a fresh trial.
 */
export function getGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  let token: string | null = null;
  try {
    token = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  if (!token) {
    token = readCookie();
    if (token) setGuestToken(token);
  } else if (!readCookie()) {
    setGuestToken(token);
  }
  return token;
}

export function setGuestToken(token: string) {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* storage blocked */
  }
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

export function clearGuestToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
}

export const guestAuthHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

export async function fetchGuestConfig(): Promise<GuestConfig> {
  const res = await api.get("/guest/config");
  return res.data.data;
}

export async function fetchGuestStatus(token: string): Promise<GuestStatus> {
  const res = await api.get("/guest/status", { headers: guestAuthHeader(token) });
  return res.data.data;
}

/** Returns the stored guest token, or starts a new trial session. */
export async function ensureGuestSession(): Promise<{
  token: string;
  status?: GuestStatus;
}> {
  const existing = getGuestToken();
  if (existing) {
    try {
      return { token: existing, status: await fetchGuestStatus(existing) };
    } catch (err) {
      // Expired/invalid token falls through to a new session below.
      const httpStatus = (err as { response?: { status?: number } }).response?.status;
      if (httpStatus !== 401 && httpStatus !== 403) throw err;
      clearGuestToken();
    }
  }
  const res = await api.post("/guest/session");
  const { token, singleLeft, multiLeft } = res.data.data;
  setGuestToken(token);
  return { token, status: { singleLeft, multiLeft } };
}

/** After signup/login: moves the guest's chats into the account. Never throws. */
export async function mergeGuestChatsIntoAccount() {
  const guestToken = getGuestToken();
  if (!guestToken) return;
  try {
    await api.post("/guest/merge", { guestToken });
  } catch {
    // Best effort — the account works either way.
  } finally {
    clearGuestToken();
  }
}

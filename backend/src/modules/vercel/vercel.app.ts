import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { decrypt, encrypt, isEncryptionConfigured } from "@/utils/crypto.js";
import { VERCEL_API, VERCEL_WEB, type VercelConfig } from "./vercel.types.js";

/**
 * Vercel Integration credentials and the user's token.
 *
 * Much smaller than github.app.ts: a Vercel Integration hands out one
 * long-lived Bearer token per installation. There is no app JWT, no
 * installation token and no refresh flow — a token Vercel rejects means the
 * user has to reconnect.
 *
 * Nothing here runs at module load: the server must boot fine before the
 * VERCEL_* vars exist, and only Vercel features should fail without them.
 */

const REQUIRED_ENV = [
  "VERCEL_CLIENT_ID",
  "VERCEL_CLIENT_SECRET",
  "VERCEL_INTEGRATION_SLUG",
  "VERCEL_CALLBACK_URL",
  "FRONTEND_VERCEL_CALLBACK_URL",
] as const;

function missingEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
}

/** Cheap, never throws — drives `configured` in the status endpoint. */
export function isVercelConfigured(): boolean {
  return missingEnv().length === 0 && isEncryptionConfigured();
}

export function getVercelConfig(): VercelConfig {
  const missing = missingEnv();
  if (missing.length) {
    throw new ApiError(
      `Vercel integration is not configured on the server (missing ${missing.join(", ")})`,
      STATUS_CODES.SERVER_ERROR,
    );
  }
  return {
    clientId: process.env.VERCEL_CLIENT_ID!.trim(),
    clientSecret: process.env.VERCEL_CLIENT_SECRET!.trim(),
    integrationSlug: process.env.VERCEL_INTEGRATION_SLUG!.trim(),
    callbackUrl: process.env.VERCEL_CALLBACK_URL!.trim(),
    frontendCallbackUrl: process.env.FRONTEND_VERCEL_CALLBACK_URL!.trim(),
  };
}

/** The integration's "external installation flow" entry point. */
export function installUrl(state: string): string {
  const { integrationSlug } = getVercelConfig();
  const url = new URL(`${VERCEL_WEB}/integrations/${encodeURIComponent(integrationSlug)}/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface VercelTokenResponse {
  token_type: string;
  access_token: string;
  /** The integration configuration (icfg_...). */
  installation_id: string;
  user_id: string;
  /** Non-null when the user installed onto a Team. */
  team_id: string | null;
}

/**
 * Exchanges the `code` from the install redirect. Vercel wants a form body here,
 * not JSON. The code is single-use and valid for 30 minutes.
 */
export async function exchangeCodeForToken(code: string): Promise<VercelTokenResponse> {
  const { clientId, clientSecret, callbackUrl } = getVercelConfig();

  let response: Response;
  try {
    response = await fetch(`${VERCEL_API}/v2/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApiError("Could not reach Vercel — try connecting again", STATUS_CODES.BAD_REQUEST);
  }

  const body = (await response.json().catch(() => ({}))) as Partial<VercelTokenResponse> & {
    error?: string | { message?: string };
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    const detail =
      body.error_description ||
      (typeof body.error === "string" ? body.error : body.error?.message) ||
      String(response.status);
    // Not 401: the frontend's axios interceptor logs the user out of the app on any 401.
    throw new ApiError(`Vercel rejected the authorization: ${detail}`, STATUS_CODES.BAD_REQUEST);
  }
  return {
    token_type: body.token_type ?? "Bearer",
    access_token: body.access_token,
    installation_id: body.installation_id ?? "",
    user_id: body.user_id ?? "",
    team_id: body.team_id ?? null,
  };
}

/** The error every "the user must reconnect Vercel" path throws. */
export function reauthError(message = "Your Vercel authorization is no longer valid — reconnect Vercel") {
  // 409, never 401: a 401 from our API logs the user out of the whole app
  // (frontend/lib/api.ts), and a dead Vercel token is not a dead app session.
  return Object.assign(new ApiError(message, STATUS_CODES.CONFLICT), {
    code: "VERCEL_REAUTH",
    details: { reconnect: true },
  });
}

export function encryptToken(token: string): string {
  return encrypt(token);
}

/** The decrypted token. Throws VERCEL_REAUTH when it is missing or unreadable. */
export function getAccessToken(connection: { accessTokenEnc: string | null }): string {
  if (!connection.accessTokenEnc) throw reauthError("Your Vercel authorization is missing — reconnect Vercel");
  try {
    return decrypt(connection.accessTokenEnc);
  } catch {
    // decrypt() throws a 401 ApiError (key changed or ciphertext tampered); remap it
    // so it can't log the user out of the app.
    throw reauthError("Your stored Vercel authorization could not be read — reconnect Vercel");
  }
}

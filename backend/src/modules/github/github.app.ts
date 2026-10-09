import { createPrivateKey } from "node:crypto";
import jwt from "jsonwebtoken";
import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { decrypt, encrypt, isEncryptionConfigured } from "@/utils/crypto.js";
import { GITHUB_API, GITHUB_API_VERSION, GITHUB_WEB, type GithubConfig } from "./github.types.js";

/**
 * GitHub App authentication. Three token types, in dependency order:
 *
 *   App JWT (RS256, <=10 min)   -> mints installation tokens
 *   Installation token (ghs_)   -> all git data ops on linked repos, 1h, re-minted
 *   User-to-server token (ghu_) -> acting AS the user: list/create repos, 8h + refresh
 *
 * Nothing here runs at module load: the server must boot fine before the
 * GITHUB_* vars exist, and only GitHub features should fail without them.
 */

const REQUIRED_ENV = [
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_CALLBACK_URL",
  "FRONTEND_GITHUB_CALLBACK_URL",
] as const;

function missingEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
}

/** Cheap, never throws — drives `configured` in the status endpoint. */
export function isGithubConfigured(): boolean {
  return missingEnv().length === 0 && isEncryptionConfigured();
}

/**
 * A multi-line PEM does not survive most .env files, and GitHub hands out a
 * PKCS#1 ".pem" that people paste in several shapes. Accept all of them and
 * verify the result actually parses, so a bad key fails here with a clear
 * message instead of deep inside jwt.sign().
 *
 * Handled: a verbatim PEM (real or \n-escaped newlines), a base64-encoded
 * whole PEM, and the bare base64 key body with the BEGIN/END lines stripped.
 */
function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  const candidates: string[] = [];

  if (trimmed.includes("BEGIN")) {
    candidates.push(trimmed.replace(/\\n/g, "\n"));
  } else {
    // Either base64 of a whole PEM, or the bare base64 body of the key itself.
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    if (decoded.includes("BEGIN")) candidates.push(decoded);

    const body = trimmed.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n").trim();
    // PKCS#1 ("RSA PRIVATE KEY") is what GitHub issues; PKCS#8 is tried as a fallback.
    for (const label of ["RSA PRIVATE KEY", "PRIVATE KEY"]) {
      candidates.push(`-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`);
    }
  }

  for (const candidate of candidates) {
    try {
      createPrivateKey(candidate);
      return candidate;
    } catch {
      // Try the next shape.
    }
  }
  throw new ApiError(
    "GITHUB_APP_PRIVATE_KEY could not be read as a private key — paste the .pem base64-encoded (base64 -w0 your-app.pem)",
    STATUS_CODES.SERVER_ERROR,
  );
}

export function getGithubConfig(): GithubConfig {
  const missing = missingEnv();
  if (missing.length) {
    throw new ApiError(
      `GitHub integration is not configured on the server (missing ${missing.join(", ")})`,
      STATUS_CODES.SERVER_ERROR,
    );
  }
  return {
    appId: process.env.GITHUB_APP_ID!.trim(),
    appSlug: process.env.GITHUB_APP_SLUG!.trim(),
    privateKey: normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY!),
    clientId: process.env.GITHUB_APP_CLIENT_ID!.trim(),
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!.trim(),
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() || null,
    callbackUrl: process.env.GITHUB_CALLBACK_URL!.trim(),
    frontendCallbackUrl: process.env.FRONTEND_GITHUB_CALLBACK_URL!.trim(),
  };
}

/** Short-lived App JWT. `iat` is backdated 60s to tolerate clock skew. */
export function createAppJwt(): string {
  const { appId, privateKey } = getGithubConfig();
  const now = Math.floor(Date.now() / 1000);
  try {
    return jwt.sign({ iat: now - 60, exp: now + 540, iss: appId }, privateKey, { algorithm: "RS256" });
  } catch (error: any) {
    throw new ApiError(`GitHub App private key is invalid: ${error?.message ?? error}`, STATUS_CODES.SERVER_ERROR);
  }
}

/* ------------------------------------------------------------------ *
 * Installation tokens
 * ------------------------------------------------------------------ */

// Per-process cache. Multiple instances each keep their own — harmless, since
// minting is idempotent and GitHub allows concurrent valid tokens.
const installationTokens = new Map<string, { token: string; expiresAt: number }>();

export async function getInstallationToken(installationId: string): Promise<string> {
  const cached = installationTokens.get(installationId);
  // 60s of headroom so a token cannot expire mid-request.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${createAppJwt()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    installationTokens.delete(installationId);
    if (response.status === 404) {
      throw new ApiError(
        "This GitHub installation no longer exists — reconnect your GitHub account",
        STATUS_CODES.UNAUTHORIZED,
      );
    }
    const detail = await response.text().catch(() => "");
    throw new ApiError(
      `Could not authenticate with GitHub (${response.status}) ${detail.slice(0, 200)}`,
      STATUS_CODES.BAD_REQUEST,
    );
  }

  const body = (await response.json()) as { token: string; expires_at: string };
  installationTokens.set(installationId, { token: body.token, expiresAt: new Date(body.expires_at).getTime() });
  return body.token;
}

/**
 * The permissions the App is configured to request, and the ones a given
 * installation has actually accepted. They differ right after the owner adds a
 * permission: existing installations keep the old set until their owner accepts.
 */
export async function getPermissionState(installationId: string): Promise<{
  app: Record<string, string>;
  installation: Record<string, string>;
}> {
  const headers = {
    Authorization: `Bearer ${createAppJwt()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
  const [app, installation] = await Promise.all([
    fetch(`${GITHUB_API}/app`, { headers }),
    fetch(`${GITHUB_API}/app/installations/${installationId}`, { headers }),
  ]);
  if (!app.ok || !installation.ok) {
    throw new ApiError("Could not read the GitHub App's permissions", STATUS_CODES.BAD_REQUEST);
  }
  return {
    app: ((await app.json()) as { permissions?: Record<string, string> }).permissions ?? {},
    installation: ((await installation.json()) as { permissions?: Record<string, string> }).permissions ?? {},
  };
}

/** Called when an installation is revoked, so a stale token is never reused. */
export function forgetInstallationToken(installationId: string): void {
  installationTokens.delete(installationId);
}

/* ------------------------------------------------------------------ *
 * User-to-server tokens
 * ------------------------------------------------------------------ */

export interface GithubUserTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
}

async function postOauthToken(params: Record<string, string>): Promise<GithubUserTokenResponse> {
  const response = await fetch(`${GITHUB_WEB}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
  });

  // GitHub returns 200 with an `error` field for most failures, so status alone is not enough.
  const body = (await response.json().catch(() => ({}))) as GithubUserTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || body.error || !body.access_token) {
    throw new ApiError(
      `GitHub rejected the authorization: ${body.error_description || body.error || response.status}`,
      STATUS_CODES.UNAUTHORIZED,
    );
  }
  return body;
}

/** Exchanges the `code` from the install callback for a user-to-server token. */
export async function exchangeCodeForUserToken(code: string): Promise<GithubUserTokenResponse> {
  const { clientId, clientSecret, callbackUrl } = getGithubConfig();
  return postOauthToken({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl,
  });
}

/** Maps a token response onto the encrypted columns of GithubConnection. */
export function userTokenFields(token: GithubUserTokenResponse) {
  const now = Date.now();
  return {
    userTokenEnc: encrypt(token.access_token),
    // No expires_in means the App has "Expire user authorization tokens" off:
    // the token is permanent and there is no refresh token to store.
    userTokenExpiresAt: token.expires_in ? new Date(now + token.expires_in * 1000) : null,
    refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : null,
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? new Date(now + token.refresh_token_expires_in * 1000)
      : null,
  };
}

export interface ConnectionTokenRow {
  id: number;
  userTokenEnc: string | null;
  userTokenExpiresAt: Date | null;
  refreshTokenEnc: string | null;
  refreshTokenExpiresAt: Date | null;
}

/**
 * A valid user token, refreshing it in place when it has expired. Throws when
 * the user must reconnect — callers surface that as a "reconnect" prompt.
 */
export async function getUserToken(connection: ConnectionTokenRow): Promise<string> {
  if (!connection.userTokenEnc) {
    throw new ApiError("Your GitHub authorization is missing — reconnect your account", STATUS_CODES.UNAUTHORIZED);
  }

  const expiresAt = connection.userTokenExpiresAt?.getTime() ?? null;
  // Non-expiring token, or still valid with a minute to spare.
  if (expiresAt === null || expiresAt > Date.now() + 60_000) return decrypt(connection.userTokenEnc);

  const refreshUnusable =
    !connection.refreshTokenEnc ||
    (connection.refreshTokenExpiresAt !== null && connection.refreshTokenExpiresAt.getTime() <= Date.now());
  if (refreshUnusable) {
    throw new ApiError("Your GitHub authorization expired — reconnect your account", STATUS_CODES.UNAUTHORIZED);
  }

  const { clientId, clientSecret } = getGithubConfig();
  const refreshed = await postOauthToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: decrypt(connection.refreshTokenEnc!),
  });

  const fields = userTokenFields(refreshed);
  await prisma.githubConnection.update({ where: { id: connection.id }, data: fields });
  // Keep the caller's copy in step, in case it is reused later in this request.
  Object.assign(connection, fields);
  return refreshed.access_token;
}

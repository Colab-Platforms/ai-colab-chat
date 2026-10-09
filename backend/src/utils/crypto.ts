import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "./ApiError.js";
import STATUS_CODES from "./statusCodes.js";

/**
 * AES-256-GCM for third-party tokens we must be able to read back (GitHub
 * access/refresh tokens). Passwords and OTPs stay on bcrypt (utils/auth.ts) —
 * those are only ever compared, never recovered.
 *
 * The key is read lazily, never at module load: the server must boot fine
 * before TOKEN_ENCRYPTION_KEY is configured, and only the features that
 * actually store tokens should fail without it.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new ApiError("TOKEN_ENCRYPTION_KEY is not configured on the server", STATUS_CODES.SERVER_ERROR);
  }

  // Accept hex (openssl rand -hex 32) or base64 — whichever the operator pasted.
  let key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new ApiError(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}) — use: openssl rand -hex 32`,
      STATUS_CODES.SERVER_ERROR,
    );
  }

  cachedKey = key;
  return key;
}

/** True when a key is configured and usable — lets callers degrade instead of throwing. */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Returns "<iv>:<authTag>:<ciphertext>", all base64. */
export function encrypt(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Inverse of encrypt(). Throws if the blob was tampered with or the key changed. */
export function decrypt(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 3) throw new ApiError("Malformed encrypted value", STATUS_CODES.SERVER_ERROR);

  const [ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Wrong key or tampered ciphertext — never leak the underlying crypto message.
    throw new ApiError("Stored credential could not be decrypted — reconnect the integration", STATUS_CODES.UNAUTHORIZED);
  }
}

/** Constant-time compare for webhook signatures. Never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

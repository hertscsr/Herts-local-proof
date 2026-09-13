/**
 * Minimal admin auth: one shared password (ADMIN_PASSWORD env var), no user
 * accounts. Good enough for a single-owner admin panel — this is NOT meant
 * to scale to multiple staff logins with different permissions. If/when
 * that's needed, swap this for real Supabase Auth with a users table.
 *
 * Session = a signed cookie: `${expiryTimestamp}.${hmacSignature}`, verified
 * with Web Crypto (works in both middleware/edge and normal server routes).
 * No session state is stored anywhere — the signature IS the proof.
 */

const COOKIE_NAME = "admin_session";
const SESSION_DAYS = 30;

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set — required for admin login to work. Pick any long random string and add it as an env var."
    );
  }
  return secret;
}

// Uses only Web Crypto + btoa, not Node's Buffer, so this also works
// unmodified in the Edge runtime (middleware.ts runs there).
async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const bytes = new Uint8Array(sigBuffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSessionToken(): Promise<string> {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const signature = await sign(String(expiry));
  return `${expiry}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expiryStr, signature] = token.split(".");
  if (!expiryStr || !signature) return false;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

  const expectedSignature = await sign(expiryStr);
  return signature === expectedSignature;
}

export function checkPassword(candidate: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) {
    throw new Error("ADMIN_PASSWORD is not set — required for admin login to work.");
  }
  return candidate === real;
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

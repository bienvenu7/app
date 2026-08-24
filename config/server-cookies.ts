import { cookies } from "next/headers";
import {
  ACCESS_EXPIRES_AT_KEY,
  ACCESS_TOKEN_KEY,
  AUTH_SESSION_KEY,
  AUTH_SESSION_MAX_AGE_DAYS,
  DEFAULT_ACCESS_TTL_SEC,
  LEGACY_REFRESH_TOKEN_KEY,
  REFRESH_SKEW_MS,
  UUID_KEY,
} from "@/config/cookies";
import { createSignedAuthSession } from "@/lib/session-hint";

export { DEFAULT_ACCESS_TTL_SEC };

export const REFRESH_COOKIE_KEY = "refresh";

const AUTH_COOKIE_KEYS = [
  ACCESS_TOKEN_KEY,
  ACCESS_EXPIRES_AT_KEY,
  AUTH_SESSION_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  UUID_KEY,
  REFRESH_COOKIE_KEY,
] as const;

function cookieSecure() {
  return process.env.NODE_ENV === "production";
}

function cookieBase() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: cookieSecure(),
  };
}

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_TOKEN_KEY)?.value ?? null;
}

export async function getAccessExpiresAt(): Promise<number | null> {
  const jar = await cookies();
  const raw = jar.get(ACCESS_EXPIRES_AT_KEY)?.value;
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? ms : null;
}

export async function getRefreshToken(): Promise<string | null> {
  const jar = await cookies();
  return (
    jar.get(REFRESH_COOKIE_KEY)?.value ??
    jar.get(LEGACY_REFRESH_TOKEN_KEY)?.value ??
    null
  );
}

/** Header sent upstream — the API has used both `refresh` and `refreshToken`. */
export function upstreamRefreshCookieHeader(value: string): string {
  return `${REFRESH_COOKIE_KEY}=${value}; ${LEGACY_REFRESH_TOKEN_KEY}=${value}`;
}

export async function hasAuthSession(): Promise<boolean> {
  const jar = await cookies();
  return (
    !!jar.get(AUTH_SESSION_KEY)?.value || !!jar.get(ACCESS_TOKEN_KEY)?.value
  );
}

export async function shouldRefreshAccess(): Promise<boolean> {
  const token = await getAccessToken();
  const expiresAt = await getAccessExpiresAt();

  if (!token) {
    // A session hint without a refresh cookie cannot be recovered. Refreshing
    // anyway 401s and used to wipe the access token that verify-otp just set.
    return !!(await getRefreshToken());
  }
  if (!expiresAt) return false;
  return Date.now() >= expiresAt - REFRESH_SKEW_MS;
}

export async function setAccessSession(
  accessToken: string,
  expiresIn: number = DEFAULT_ACCESS_TTL_SEC,
) {
  const ttlSec =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : DEFAULT_ACCESS_TTL_SEC;
  const expiresAt = Date.now() + ttlSec * 1000;
  const accessExpires = new Date(expiresAt);
  const base = cookieBase();
  const sessionMaxAge = AUTH_SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
  // Sign first. A missing AUTH_SESSION_SECRET must not leave accessToken +
  // refresh cookies while the UI stays stuck on verify-otp.
  const hint = await createSignedAuthSession(sessionMaxAge);
  const jar = await cookies();

  jar.set(ACCESS_TOKEN_KEY, accessToken, {
    ...base,
    expires: accessExpires,
    httpOnly: true,
  });
  jar.set(ACCESS_EXPIRES_AT_KEY, String(expiresAt), {
    ...base,
    expires: accessExpires,
    httpOnly: true,
  });
  jar.set(AUTH_SESSION_KEY, hint, {
    ...base,
    maxAge: sessionMaxAge,
    httpOnly: false,
  });
}

/** Re-sign the UI session hint after a valid API call (migrates legacy `authSession=1`). */
export async function refreshAuthSessionHint() {
  const token = await getAccessToken();
  if (!token) return;

  const jar = await cookies();
  const sessionMaxAge = AUTH_SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
  jar.set(AUTH_SESSION_KEY, await createSignedAuthSession(sessionMaxAge), {
    ...cookieBase(),
    maxAge: sessionMaxAge,
    httpOnly: false,
  });
}

export async function setRefreshCookie(
  value: string,
  maxAgeSec: number = AUTH_SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
) {
  const jar = await cookies();
  jar.set(REFRESH_COOKIE_KEY, value, {
    ...cookieBase(),
    httpOnly: true,
    maxAge: Number.isFinite(maxAgeSec) && maxAgeSec > 0 ? maxAgeSec : undefined,
  });
  // Stop sending a leftover `refreshToken` from the pre-BFF client.
  jar.delete(LEGACY_REFRESH_TOKEN_KEY);
}

export async function clearAuthSession() {
  const jar = await cookies();
  for (const name of AUTH_COOKIE_KEYS) {
    jar.delete(name);
  }
}

const UPSTREAM_REFRESH_NAMES = new Set([
  REFRESH_COOKIE_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  "refresh_token",
]);

function isUpstreamRefreshCookieName(name: string) {
  return UPSTREAM_REFRESH_NAMES.has(name.toLowerCase());
}

/** Copy upstream `Set-Cookie: refresh=` / `refreshToken=` onto the Next.js response. */
export async function copyRefreshSetCookie(
  setCookie: string | string[] | undefined,
) {
  if (!setCookie) return;
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];

  for (const header of headers) {
    const first = header.split(";")[0]?.trim() ?? "";
    const eq = first.indexOf("=");
    if (eq < 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!isUpstreamRefreshCookieName(name) || !value) continue;

    let maxAge: number | undefined;
    for (const attr of header.split(";").slice(1)) {
      const [rawKey, rawVal] = attr.split("=");
      if (rawKey?.trim().toLowerCase() === "max-age" && rawVal) {
        const parsed = Number(rawVal.trim());
        if (Number.isFinite(parsed)) maxAge = parsed;
      }
    }
    await setRefreshCookie(value, maxAge);
    return;
  }
}

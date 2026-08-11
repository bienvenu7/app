import cookies from "js-cookie";

/**
 * VPS / IP over HTTP: Secure cookies are rejected by the browser.
 * Vercel is HTTPS so Secure works there — match the page protocol, not NODE_ENV.
 */
const cookieSecure = (): boolean =>
  typeof window !== "undefined" && window.location.protocol === "https:";

const cookieBase = () => ({
  path: "/",
  sameSite: "lax" as const,
  secure: cookieSecure(),
});

/** Access JWT (readable by JS for Authorization header). */
export const ACCESS_TOKEN_KEY = "accessToken";
/** Epoch ms when access expires — used for proactive refresh (< 60s). */
export const ACCESS_EXPIRES_AT_KEY = "accessExpiresAt";
/**
 * Non-sensitive session hint (7d, matches refresh cookie lifetime).
 * Middleware uses this so routes stay reachable while access is refreshed.
 */
export const AUTH_SESSION_KEY = "authSession";
/** Legacy client-side refresh cookie — no longer set; cleared on logout. */
export const LEGACY_REFRESH_TOKEN_KEY = "refreshToken";
export const UUID_KEY = "uuid";

export const DEFAULT_ACCESS_TTL_SEC = 900;
export const AUTH_SESSION_MAX_AGE_DAYS = 7;
/** Refresh when access expires within this window (guide: 60s). */
export const REFRESH_SKEW_MS = 60_000;

const AUTH_COOKIE_KEYS = [
  ACCESS_TOKEN_KEY,
  ACCESS_EXPIRES_AT_KEY,
  AUTH_SESSION_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  UUID_KEY,
] as const;

export const setCookie = (name: string, value: string, days: number = 1) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  cookies.set(name, value, {
    ...cookieBase(),
    expires,
  });
};

export const setCookieUntil = (name: string, value: string, expires: Date) => {
  cookies.set(name, value, {
    ...cookieBase(),
    expires,
  });
};

export const getCookie = (name: string): string | null => {
  const cookieData = cookies.get(name);
  return cookieData ? cookieData : null;
};

export const deleteCookie = (data: string[]) => {
  data.forEach((name) => {
    cookies.remove(name, {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure(),
    });
    cookies.remove(name, { path: "/" });
  });
};

export function getAccessToken(): string | null {
  return getCookie(ACCESS_TOKEN_KEY);
}

export function getAccessExpiresAt(): number | null {
  const raw = getCookie(ACCESS_EXPIRES_AT_KEY);
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function hasAuthSession(): boolean {
  return !!getCookie(AUTH_SESSION_KEY) || !!getAccessToken();
}

/** True when access is missing or expires within REFRESH_SKEW_MS. */
export function shouldRefreshAccess(): boolean {
  const token = getAccessToken();
  const expiresAt = getAccessExpiresAt();

  if (!token) {
    // Session hint without access → must refresh before calling API.
    return !!getCookie(AUTH_SESSION_KEY);
  }
  if (!expiresAt) {
    // Legacy session without expiresAt → refresh proactively once.
    return true;
  }
  return Date.now() >= expiresAt - REFRESH_SKEW_MS;
}

/**
 * Persist access JWT + expiry from verify-otp / refresh-token.
 * Does NOT store the HttpOnly `refresh` cookie (server-set only).
 */
export function setAccessSession(
  accessToken: string,
  expiresIn: number = DEFAULT_ACCESS_TTL_SEC,
) {
  const ttlSec =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : DEFAULT_ACCESS_TTL_SEC;
  const expiresAt = Date.now() + ttlSec * 1000;
  const accessExpires = new Date(expiresAt);

  setCookieUntil(ACCESS_TOKEN_KEY, accessToken, accessExpires);
  setCookieUntil(ACCESS_EXPIRES_AT_KEY, String(expiresAt), accessExpires);
  setCookie(AUTH_SESSION_KEY, "1", AUTH_SESSION_MAX_AGE_DAYS);
}

export function clearAuthSession() {
  deleteCookie([...AUTH_COOKIE_KEYS]);
}

/** Clear auth cookies + sessionStorage (PIN keys handled separately). */
export const clearAuthCookies = () => {
  clearAuthSession();

  if (typeof window === "undefined") return;

  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
};

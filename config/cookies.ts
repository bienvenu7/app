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

/** Access JWT — HttpOnly, set only by the server BFF. Never read from JS. */
export const ACCESS_TOKEN_KEY = "accessToken";
/** Epoch ms when access expires — HttpOnly, server-only. */
export const ACCESS_EXPIRES_AT_KEY = "accessExpiresAt";
/**
 * Non-sensitive session hint (7d, matches refresh cookie lifetime).
 * Middleware + client UI use this so routes stay reachable while access
 * is refreshed via the HttpOnly `refresh` cookie.
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

/** Session hint only — JWT is HttpOnly and invisible to JS. */
export function hasAuthSession(): boolean {
  return !!getCookie(AUTH_SESSION_KEY);
}

export function clearAuthSession() {
  deleteCookie([...AUTH_COOKIE_KEYS]);
}

/** Clear readable auth cookies + sessionStorage (PIN keys handled separately). */
export const clearAuthCookies = () => {
  clearAuthSession();

  if (typeof window === "undefined") return;

  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
};

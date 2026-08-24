import "server-only";
import https from "node:https";
import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  clearAuthSession,
  copyRefreshSetCookie,
  DEFAULT_ACCESS_TTL_SEC,
  getAccessToken,
  getRefreshToken,
  setAccessSession,
  shouldRefreshAccess,
} from "@/config/server-cookies";
import { toAuthHttpError } from "@/lib/auth-errors";

/**
 * BFF — axios serveur uniquement. Le navigateur n'appelle pas api.afrue.com
 * et n'a plus de rewrite `/v3` (C1).
 */
export const baseURL = "https://api.afrue.com/v3/";

/** Node on macOS often hangs ~75s on a broken IPv6 (AAAA) path before falling back to IPv4. */
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });
const API_TIMEOUT_MS = 20_000;

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const SKIP_REFRESH_RE =
  /auth\/(login|verify-otp|refresh-token|resend-otp|confirm-email|forgot-password|update-password)|clients\/(forgot-password|reset-password|register)/i;

function shouldSkipRefresh(url?: string) {
  if (!url) return false;
  return SKIP_REFRESH_RE.test(url);
}

function setCookieHeaders(setCookie: string | string[] | undefined) {
  return copyRefreshSetCookie(setCookie);
}

type RefreshedSession = {
  accessToken: string;
  expiresIn: number;
  setCookie: string | string[] | undefined;
};

/**
 * In-flight upstream refresh calls, keyed by the refresh token so that only
 * requests from the same session share a round trip. A single module-level
 * promise would be shared by every request in the Node process and hand one
 * user's access token to another.
 */
const inflightRefresh = new Map<string, Promise<RefreshedSession>>();

async function fetchRefreshedSession(
  refresh: string | null,
): Promise<RefreshedSession> {
  const { data, headers } = await axios.get<{
    accessToken: string;
    expiresIn?: number;
  }>(`${baseURL}auth/refresh-token`, {
    headers: refresh ? { Cookie: `refresh=${refresh}` } : {},
    httpsAgent: ipv4Agent,
    timeout: API_TIMEOUT_MS,
  });

  if (!data?.accessToken) {
    throw new Error("refresh-token: missing accessToken");
  }

  return {
    accessToken: data.accessToken,
    expiresIn: data.expiresIn ?? DEFAULT_ACCESS_TTL_SEC,
    setCookie: headers["set-cookie"],
  };
}

function refreshSession(refresh: string | null): Promise<RefreshedSession> {
  // Without a refresh cookie nothing identifies the session, so never share.
  if (!refresh) return fetchRefreshedSession(refresh);

  const pending = inflightRefresh.get(refresh);
  if (pending) return pending;

  const started = fetchRefreshedSession(refresh).finally(() => {
    inflightRefresh.delete(refresh);
  });
  inflightRefresh.set(refresh, started);
  return started;
}

export async function refreshAccessToken(): Promise<string> {
  const refresh = await getRefreshToken();

  try {
    const session = await refreshSession(refresh);
    // Written per request: a request that joined an in-flight refresh still
    // needs the cookies set on its own response, not on the initiator's.
    await setCookieHeaders(session.setCookie);
    await setAccessSession(session.accessToken, session.expiresIn);
    return session.accessToken;
  } catch (error) {
    await clearAuthSession();
    throw error;
  }
}

function attachAuthInterceptors(client: AxiosInstance) {
  client.interceptors.request.use(async (config) => {
    if (shouldSkipRefresh(config.url)) {
      const refresh = await getRefreshToken();
      if (refresh) {
        config.headers.Cookie = `refresh=${refresh}`;
      }
      return config;
    }

    try {
      if (await shouldRefreshAccess()) {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        const token = await getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch {
      // Let the request proceed (or fail) without a bearer.
    }

    const refresh = await getRefreshToken();
    if (refresh) {
      config.headers.Cookie = `refresh=${refresh}`;
    }

    return config;
  });

  client.interceptors.response.use(
    async (response) => {
      try {
        await setCookieHeaders(response.headers["set-cookie"]);
      } catch {
        /* upstream succeeded; cookie copy is best-effort */
      }
      return response;
    },
    async (error: AxiosError) => {
      const original = error.config as RetriableConfig | undefined;
      if (error.response) {
        try {
          await setCookieHeaders(error.response.headers["set-cookie"]);
        } catch {
          /* ignore */
        }
      }

      if (!original || original._retry) {
        return Promise.reject(toAuthHttpError(error) ?? error);
      }
      if (error.response?.status !== 401) {
        return Promise.reject(toAuthHttpError(error) ?? error);
      }
      if (shouldSkipRefresh(original.url)) {
        return Promise.reject(toAuthHttpError(error) ?? error);
      }

      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return client.request(original);
      } catch {
        return Promise.reject(toAuthHttpError(error) ?? error);
      }
    },
  );
}

export const instance = axios.create({
  baseURL,
  timeout: API_TIMEOUT_MS,
  httpsAgent: ipv4Agent,
});

attachAuthInterceptors(instance);

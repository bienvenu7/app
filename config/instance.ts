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

let refreshPromise: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refresh = await getRefreshToken();
        const { data, headers } = await axios.get<{
          accessToken: string;
          expiresIn?: number;
        }>(`${baseURL}auth/refresh-token`, {
          headers: refresh ? { Cookie: `refresh=${refresh}` } : {},
          httpsAgent: ipv4Agent,
          timeout: API_TIMEOUT_MS,
        });

        await setCookieHeaders(headers["set-cookie"]);

        if (!data?.accessToken) {
          throw new Error("refresh-token: missing accessToken");
        }

        await setAccessSession(
          data.accessToken,
          data.expiresIn ?? DEFAULT_ACCESS_TTL_SEC,
        );
        return data.accessToken;
      } catch (error) {
        await clearAuthSession();
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
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
      await setCookieHeaders(response.headers["set-cookie"]);
      return response;
    },
    async (error: AxiosError) => {
      const original = error.config as RetriableConfig | undefined;
      if (error.response) {
        await setCookieHeaders(error.response.headers["set-cookie"]);
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

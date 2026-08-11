import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  clearAuthSession,
  getAccessToken,
  setAccessSession,
  shouldRefreshAccess,
  DEFAULT_ACCESS_TTL_SEC,
} from "@/config/cookies";

/**
 * Client HTTP Afrue.
 * En cas de conflit avec OpenAPI `/reference`, le guide
 * `docs/FRONTEND_CLIENT_SECURITY_UPDATES.md` prime.
 *
 * Routes interdites côté client (410/403) — ne pas réintroduire :
 * wipe/admin deletes, get-all/files, test-compression,
 * /v2/admin/*, /v2/stats/*, /v2/setting/*.
 */
export const baseURL = "https://api.afrue.com/v1/";
export const baseURLV2 = "https://api.afrue.com/v2/";

// export const baseURL = "http://localhost:7001/v1/";
// export const baseURLV2 = "http://localhost:7001/v2/";

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/** Auth paths that must not trigger refresh / retry loops. */
const SKIP_REFRESH_RE =
  /auth\/(login|verify-otp|refresh-token|resend-otp|confirm-email|forgot-password|update-password)|clients\/(forgot-password|reset-password|register)/i;

function shouldSkipRefresh(url?: string) {
  if (!url) return false;
  return SKIP_REFRESH_RE.test(url);
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight refresh via bare axios (avoids interceptor recursion).
 * Cookie `refresh` is sent with credentials; never read in JS.
 */
export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { data } = await axios.get<{
          accessToken: string;
          expiresIn?: number;
        }>(`${baseURL}auth/refresh-token`, {
          withCredentials: true,
        });

        if (!data?.accessToken) {
          throw new Error("refresh-token: missing accessToken");
        }

        setAccessSession(
          data.accessToken,
          data.expiresIn ?? DEFAULT_ACCESS_TTL_SEC,
        );
        return data.accessToken;
      } catch (error) {
        clearAuthSession();
        if (typeof window !== "undefined") {
          const path = window.location.pathname;
          const onLogin = path.startsWith("/auth/login");
          if (!onLogin) {
            const from = encodeURIComponent(path);
            window.location.assign(
              from && path !== "/" ? `/auth/login?from=${from}` : "/auth/login",
            );
          }
        }
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
    if (typeof window === "undefined") return config;
    if (shouldSkipRefresh(config.url)) return config;

    try {
      if (shouldRefreshAccess()) {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        const token = getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch {
      // Let the request proceed (or fail) without a bearer; response interceptor may logout.
    }

    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as RetriableConfig | undefined;
      if (!original || original._retry) {
        return Promise.reject(error);
      }
      if (error.response?.status !== 401) {
        return Promise.reject(error);
      }
      if (shouldSkipRefresh(original.url)) {
        return Promise.reject(error);
      }
      if (typeof window === "undefined") {
        return Promise.reject(error);
      }

      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return client.request(original);
      } catch {
        return Promise.reject(error);
      }
    },
  );
}

export const instance = axios.create({
  baseURL: baseURL,
  withCredentials: true,
});

export const instanceV2 = axios.create({
  baseURL: baseURLV2,
  withCredentials: true,
});

attachAuthInterceptors(instance);
attachAuthInterceptors(instanceV2);

"use server";

import { instance, refreshAccessToken } from "@/config/instance";
import type {
  IClientResponse,
  IClientUpdate,
  IClientUpdateResponse,
} from "@/types/user";
import type { TokenResponse } from "@/types/fetch";
import {
  clearAuthSession,
  copyRefreshSetCookie,
  DEFAULT_ACCESS_TTL_SEC,
  getAccessExpiresAt,
  refreshAuthSessionHint,
  setAccessSession,
  setRefreshCookie,
} from "@/config/server-cookies";
import { withAuthError } from "@/lib/auth-errors";

export const updateClient = async (
  data: IClientUpdate,
): Promise<IClientUpdateResponse> => {
  return withAuthError(async () => {
    const { userID: _userID, ...payload } = data;

    const { data: response } = await instance.patch<{
      message?: string;
      requireRelogin?: boolean;
    }>("auth/update/user", payload);

    return {
      message:
        response?.message ??
        "Vos identifiants ont été mises à jour correctement.",
      requireRelogin: !!response?.requireRelogin,
    };
  }) as Promise<IClientUpdateResponse>;
};

export const register = async (
  email: string,
  password: string,
  fullName: string,
  countryId: string,
  gender: string,
): Promise<{ message: string }> => {
  return withAuthError(async () => {
    const { data } = await instance.post("clients/register", {
      email: email.toLowerCase(),
      password,
      fullName,
      countryId,
      gender,
    });
    return data;
  }) as Promise<{ message: string }>;
};

export const confirmEmail = async (hash: string) => {
  return withAuthError(async () => {
    const { data } = await instance.post("auth/confirm-email", { hash });
    return data;
  });
};

export const reconfirmEmail = async (hash: string) => {
  return withAuthError(async () => {
    const { data } = await instance.post("auth/resend-email", { hash });
    return data;
  });
};

export const login = async (email: string, password: string) => {
  return withAuthError(async () => {
    await instance.post("auth/login", {
      email: email.toLowerCase(),
      password,
    });
    return "done";
  });
};

export const requestPasswordReset = async (
  email: string,
): Promise<{ message: string }> => {
  return withAuthError(async () => {
    const { data } = await instance.post("clients/forgot-password", {
      email,
    });
    return data;
  }) as Promise<{ message: string }>;
};

export const resetPassword = async (
  email: string,
  otp: string,
  password: string,
): Promise<{ message: string }> => {
  return withAuthError(async () => {
    const { data } = await instance.patch("clients/reset-password", {
      email,
      otp,
      password,
    });
    await clearAuthSession();
    return data;
  }) as Promise<{ message: string }>;
};

export const updatePassword = async (
  email: string,
  otp: string,
  password: string,
) => resetPassword(email, otp, password);

function pickAccessToken(data: TokenResponse | null | undefined): string | null {
  if (!data) return null;
  const rec = data as TokenResponse & { access_token?: string };
  const token = rec.accessToken || rec.access_token;
  return token ? String(token) : null;
}

function pickBodyRefresh(data: TokenResponse | null | undefined): string | null {
  if (!data) return null;
  const rec = data as TokenResponse & {
    refreshToken?: string;
    refresh?: string;
    refresh_token?: string;
  };
  const token = rec.refreshToken || rec.refresh || rec.refresh_token;
  return token ? String(token) : null;
}

export const confirmOtp = async (email: string, newOtp: string) => {
  return withAuthError(async () => {
    const { data, headers } = await instance.post<TokenResponse>(
      "auth/verify-otp",
      {
        email,
        otp: newOtp,
      },
    );

    const accessToken = pickAccessToken(data);
    if (!accessToken) {
      throw new Error("verify-otp: missing accessToken in response");
    }

    await copyRefreshSetCookie(headers["set-cookie"]);
    const bodyRefresh = pickBodyRefresh(data);
    if (bodyRefresh) {
      await setRefreshCookie(bodyRefresh);
    }

    await setAccessSession(
      accessToken,
      data.expiresIn ?? DEFAULT_ACCESS_TTL_SEC,
    );

    // Same action: the cookie store now has the access token, so get-auth
    // does not depend on a second round-trip that might miss Set-Cookie.
    try {
      const { data: user } = await instance.get<IClientResponse>("auth/get-auth", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      try {
        await refreshAuthSessionHint();
      } catch {
        /* hint is best-effort */
      }
      return { ok: true as const, user };
    } catch {
      return { ok: true as const, user: null };
    }
  });
};

export const confirmOtpUpdate = async (
  email: string,
  newOtp: string[],
): Promise<number> => {
  return withAuthError(async () => {
    const otp = newOtp.join("");
    const { status } = await instance.post("auth/verify-otp", {
      email,
      otp,
    });
    return status;
  }) as Promise<number>;
};

export const resendOtp = async (email: string) => {
  return withAuthError(async () => {
    await instance.post("auth/resend-otp", { email });
    return "done";
  });
};

/** True when the HttpOnly access cookie is present (JS cannot see it). */
export const hasAccessSession = async () => {
  const token = await getAccessToken();
  return { ok: !!token };
};

export const getAuth = async (): Promise<IClientResponse> => {
  return withAuthError(async () => {
    const { data } = await instance.get("auth/get-auth");
    try {
      await refreshAuthSessionHint();
    } catch {
      // A 200 from the API is the session. Rewriting the hint cookie must
      // not turn that into a failed server action.
    }
    return data;
  }) as Promise<IClientResponse>;
};

export const logout = async () => {
  return withAuthError(async () => {
    try {
      await instance.get("auth/logout");
    } finally {
      await clearAuthSession();
    }
    return "done";
  });
};

/** Drop HttpOnly session cookies when the UI logs out or getAuth fails. */
export const clearSessionCookies = async () => {
  await clearAuthSession();
  return "done" as const;
};

export const refresh = async (): Promise<{ expiresIn: number }> => {
  return withAuthError(async () => {
    await refreshAccessToken();
    const expiresAt = await getAccessExpiresAt();
    const expiresIn = expiresAt
      ? Math.max(1, Math.round((expiresAt - Date.now()) / 1000))
      : DEFAULT_ACCESS_TTL_SEC;
    return { expiresIn };
  }) as Promise<{ expiresIn: number }>;
};

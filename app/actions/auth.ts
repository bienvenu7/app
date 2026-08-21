"use server";

import { instance, refreshAccessToken } from "@/config/instance";
import type {
  IClientResponse,
  IClientUpdate,
  IClientUpdateResponse,
} from "@/types/user";
import type { TokenResponse } from "@/types/fetch";
import { DEFAULT_ACCESS_TTL_SEC } from "@/config/server-cookies";
import {
  clearAuthSession,
  getAccessExpiresAt,
  setAccessSession,
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

export const confirmOtp = async (email: string, newOtp: string) => {
  return withAuthError(async () => {
    const { data } = await instance.post<TokenResponse>("auth/verify-otp", {
      email,
      otp: newOtp,
    });

    const accessToken = data.accessToken;
    if (!accessToken) {
      throw new Error("verify-otp: missing accessToken in response");
    }

    await setAccessSession(accessToken, data.expiresIn ?? DEFAULT_ACCESS_TTL_SEC);
    return data;
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

export const getAuth = async (): Promise<IClientResponse> => {
  return withAuthError(async () => {
    const { data } = await instance.get("auth/get-auth");
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

export const refresh = async (): Promise<{
  accessToken: string;
  expiresIn: number;
}> => {
  return withAuthError(async () => {
    const accessToken = await refreshAccessToken();
    const expiresAt = await getAccessExpiresAt();
    const expiresIn = expiresAt
      ? Math.max(1, Math.round((expiresAt - Date.now()) / 1000))
      : DEFAULT_ACCESS_TTL_SEC;
    return { accessToken, expiresIn };
  }) as Promise<{ accessToken: string; expiresIn: number }>;
};

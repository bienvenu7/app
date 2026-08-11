import { instance, instanceV2, refreshAccessToken } from "@/config/instance";
import type {
  IClientResponse,
  IClientUpdate,
  IClientUpdateResponse,
} from "@/types/user";
import {
  clearAuthSession,
  DEFAULT_ACCESS_TTL_SEC,
  getAccessExpiresAt,
  getAccessToken,
  setAccessSession,
} from "@/config/cookies";
import { AuthHttpError, toAuthHttpError } from "@/lib/auth-errors";

function bearerHeaders(): { Authorization: string } | Record<string, never> {
  const accessToken = getAccessToken();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export const updateClient = async (
  data: IClientUpdate,
): Promise<IClientUpdateResponse> => {
  // userID is ignored by the API — never rely on it for identity.
  const { userID: _userID, ...payload } = data;

  const { data: response } = await instance.patch<{
    message?: string;
    requireRelogin?: boolean;
  }>("auth/update/user", payload, {
    headers: bearerHeaders(),
  });

  return {
    message:
      response?.message ??
      "Vos identifiants ont été mises à jour correctement.",
    requireRelogin: !!response?.requireRelogin,
  };
};

export const register = async (
  email: string,
  password: string,
  fullName: string,
  countryId: string,
  gender: string,
): Promise<{ message: string }> => {
  const { data } = await instanceV2.post("clients/register", {
    email,
    password,
    fullName,
    countryId,
    gender,
  });
  return data;
};

export const confirmEmail = async (hash: string) => {
  const data = await instance.post("auth/confirm-email", {
    hash,
  });
  return data;
};

export const reconfirmEmail = async (hash: string) => {
  try {
    const { data } = await instance.post("auth/resend-email", {
      hash,
    });
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

export const login = async (email: string, password: string) => {
  try {
    await instance.post("auth/login", {
      email,
      password,
    });
    return "done";
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

/** Étape A — demande d'OTP reset (toujours 200, même si email inconnu). */
export const requestPasswordReset = async (
  email: string,
): Promise<{ message: string }> => {
  try {
    const { data } = await instanceV2.post("clients/forgot-password", {
      email,
    });
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

/**
 * Étape B — reset avec OTP (6 chars) + nouveau mot de passe.
 * Remplace l'ancien body `{ email, password }` sans otp.
 */
export const resetPassword = async (
  email: string,
  otp: string,
  password: string,
): Promise<{ message: string }> => {
  try {
    const { data } = await instanceV2.patch("clients/reset-password", {
      email,
      otp,
      password,
    });
    clearAuthSession();
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

/** @deprecated Prefer resetPassword(email, otp, password). */
export const updatePassword = resetPassword;

type VerifyOtpResponse = {
  accessToken?: string;
  access_token?: string;
  expiresIn?: number;
};

export const confirmOtp = async (email: string, newOtp: string) => {
  const { data } = await instance.post<VerifyOtpResponse>(
    "auth/verify-otp",
    {
      email,
      otp: newOtp,
    },
    {
      withCredentials: true,
    },
  );

  const accessToken = data.accessToken ?? data.access_token ?? null;
  if (!accessToken) {
    throw new Error("verify-otp: missing accessToken in response");
  }

  setAccessSession(accessToken, data.expiresIn ?? DEFAULT_ACCESS_TTL_SEC);
  return data;
};

export const confirmOtpUpdate = async (
  email: string,
  newOtp: string[],
): Promise<number> => {
  let otp = "";

  newOtp.map((el) => (otp = otp + el));

  const { status } = await instance.post("auth/verify-otp", {
    email,
    otp,
  });

  return status;
};

export const resendOtp = async (email: string) => {
  const response = await instance.post("auth/resend-otp", {
    email,
  });
  return response;
};

export const getAuth = async (): Promise<IClientResponse> => {
  const { data } = await instance.get("auth/get-auth", {
    headers: bearerHeaders(),
  });
  return data;
};

export const logout = async () => {
  try {
    await instance.get("auth/logout", {
      headers: bearerHeaders(),
    });
  } finally {
    clearAuthSession();
  }
  return "done";
};

export const refresh = async (): Promise<{
  accessToken: string;
  expiresIn: number;
}> => {
  const accessToken = await refreshAccessToken();
  const expiresAt = getAccessExpiresAt();
  const expiresIn = expiresAt
    ? Math.max(1, Math.round((expiresAt - Date.now()) / 1000))
    : DEFAULT_ACCESS_TTL_SEC;
  return { accessToken, expiresIn };
};

export { AuthHttpError };

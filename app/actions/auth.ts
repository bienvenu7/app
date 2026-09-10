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
  getAccessToken,
  refreshAuthSessionHint,
  setAccessSession,
  setRefreshCookie,
} from "@/config/server-cookies";
import { withAuthError } from "@/lib/auth-errors";
import { displayWhatsappNumber } from "@/lib/phone-rules";
import {
  emailOrPhonePayload,
  fallbackOtpChannel,
  identifierPayload,
  loginMethodFromIdentifier,
  parseLoginMethod,
  parseOtpChannel,
  type AuthIdentifier,
  type LoginMethod,
  type OtpChannel,
} from "@/lib/auth-identifier";

export type LoginResult = {
  message: string;
  loginMethod: LoginMethod;
  otpChannel: OtpChannel;
};

export type RegisterResult = {
  message: string;
  otpChannel: OtpChannel;
};

function sanitizeAuthProfile(user: IClientResponse): IClientResponse {
  return {
    ...user,
    whatsappNumber: displayWhatsappNumber(user.whatsappNumber),
  };
}

export const updateClient = async (
  data: IClientUpdate,
): Promise<IClientUpdateResponse> => {
  return withAuthError(async () => {
    const { userID: _userID, ...payload } = data;

    const { data: response } = await instance.patch<{
      message?: string;
      requireRelogin?: boolean;
    }>(
      "auth/update/user",
      payload,
      // Un changement de `phone` déclenche jusqu'à trois appels au fournisseur
      // WhatsApp côté serveur (~15 s au pire) : le timeout par défaut est trop
      // juste, et l'expirer ferait perdre la vraie réponse (400 ou 503).
      payload.phone ? { timeout: 35_000 } : undefined,
    );

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
  whatsappNumber?: string,
): Promise<RegisterResult> => {
  return withAuthError(async () => {
    const digits = displayWhatsappNumber(whatsappNumber);
    const { data } = await instance.post<{
      message?: string;
      otpChannel?: string;
    }>(
      "clients/register",
      {
        email: email.toLowerCase(),
        password,
        fullName,
        countryId,
        gender,
        ...(digits ? { whatsappNumber: digits } : {}),
      },
      // L'envoi OTP (WhatsApp ou email) peut dépasser le timeout par défaut.
      { timeout: 35_000 },
    );
    return {
      message: data?.message ?? "Un code de vérification a été envoyé.",
      otpChannel:
        parseOtpChannel(data?.otpChannel) ?? (digits ? "whatsapp" : "email"),
    };
  }) as Promise<RegisterResult>;
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

const OTP_DELIVERY_TIMEOUT = { timeout: 35_000 };

export const login = async (
  identifier: AuthIdentifier,
  password: string,
): Promise<LoginResult> => {
  return withAuthError(async () => {
    const payload = emailOrPhonePayload(identifier);
    const { data } = await instance.post<{
      message?: string;
      loginMethod?: string;
      otpChannel?: string;
    }>(
      "auth/login",
      {
        ...payload,
        password,
      },
      "phone" in payload ? OTP_DELIVERY_TIMEOUT : undefined,
    );
    return {
      message: data?.message ?? "done",
      loginMethod:
        parseLoginMethod(data?.loginMethod) ??
        loginMethodFromIdentifier(identifier),
      otpChannel:
        parseOtpChannel(data?.otpChannel) ?? fallbackOtpChannel(identifier),
    };
  }) as Promise<LoginResult>;
};

export const requestPasswordReset = async (
  identifier: AuthIdentifier,
): Promise<{ message: string }> => {
  return withAuthError(async () => {
    const payload = emailOrPhonePayload(identifier);
    const { data } = await instance.post(
      "clients/forgot-password",
      payload,
      "phone" in payload ? OTP_DELIVERY_TIMEOUT : undefined,
    );
    return data;
  }) as Promise<{ message: string }>;
};

export const resetPassword = async (
  identifier: AuthIdentifier,
  otp: string,
  password: string,
): Promise<{ message: string }> => {
  return withAuthError(async () => {
    const { data } = await instance.patch("clients/reset-password", {
      ...emailOrPhonePayload(identifier),
      otp,
      password,
    });
    await clearAuthSession();
    return data;
  }) as Promise<{ message: string }>;
};

export const updatePassword = async (
  identifier: AuthIdentifier,
  otp: string,
  password: string,
) => resetPassword(identifier, otp, password);

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

export const confirmOtp = async (
  identifier: AuthIdentifier,
  newOtp: string,
) => {
  return withAuthError(async () => {
    const { data, headers } = await instance.post<TokenResponse>(
      "auth/verify-otp",
      {
        ...identifierPayload(identifier),
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
      return { ok: true as const, user: sanitizeAuthProfile(user) };
    } catch {
      return { ok: true as const, user: null };
    }
  });
};

export const confirmOtpUpdate = async (
  identifier: AuthIdentifier,
  newOtp: string[],
): Promise<number> => {
  return withAuthError(async () => {
    const otp = newOtp.join("");
    const { status } = await instance.post("auth/verify-otp", {
      ...identifierPayload(identifier),
      otp,
    });
    return status;
  }) as Promise<number>;
};

export const resendOtp = async (identifier: AuthIdentifier) => {
  return withAuthError(async () => {
    const payload = identifierPayload(identifier);
    await instance.post(
      "auth/resend-otp",
      payload,
      "email" in payload ? undefined : OTP_DELIVERY_TIMEOUT,
    );
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
    return sanitizeAuthProfile(data);
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

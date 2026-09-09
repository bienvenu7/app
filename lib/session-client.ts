import { AuthHttpError, unwrapAction } from "@/lib/auth-errors";
import {
  identifierPayload,
  type AuthIdentifier,
} from "@/lib/auth-identifier";
import type { IClientResponse } from "@/types/user";

export type ConfirmOtpResult = { ok: true; user: IClientResponse | null };

const SESSION_PATH = "/auth/session";
const VERIFY_OTP_PATH = "/auth/verify-otp";

/**
 * Browser calls that must not POST to `/auth/login` or `/auth/register`.
 * Those page URLs sit behind nginx `afrue_auth` (credential stuffing).
 */
async function readActionJson<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AuthHttpError(
      response.status || 500,
      response.status === 429 ? "rate_limit" : "unknown",
    );
  }
  return unwrapAction(Promise.resolve(data as T));
}

export async function fetchSession(): Promise<IClientResponse> {
  const response = await fetch(SESSION_PATH, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  return readActionJson<IClientResponse>(response);
}

export async function verifyOtp(
  identifier: AuthIdentifier,
  otp: string,
): Promise<ConfirmOtpResult> {
  const response = await fetch(VERIFY_OTP_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...identifierPayload(identifier), otp }),
  });
  return readActionJson<ConfirmOtpResult>(response);
}

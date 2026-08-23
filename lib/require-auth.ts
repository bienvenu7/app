import { getAuth } from "@/app/actions/auth";
import { getAccessToken } from "@/config/server-cookies";
import { AuthHttpError, isActionErrorResult } from "@/lib/auth-errors";
import type { IClientResponse } from "@/types/user";

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new AuthHttpError(401, "unauthorized");
  }
  return token;
}

export async function requireAuthUser(): Promise<IClientResponse> {
  const result = await getAuth();
  if (isActionErrorResult(result)) {
    throw new AuthHttpError(result.__authError.status, result.__authError.code);
  }
  if (!result?.email || !result.id) {
    throw new AuthHttpError(401, "unauthorized");
  }
  return result;
}

export async function requireAuthEmail(): Promise<string> {
  const user = await requireAuthUser();
  return user.email.trim().toLowerCase();
}

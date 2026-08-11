import axios from "axios";

export class AuthHttpError extends Error {
  status: number;
  code:
    | "rate_limit"
    | "unauthorized"
    | "forbidden"
    | "validation"
    | "not_found"
    | "unknown";

  constructor(
    status: number,
    code: AuthHttpError["code"],
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthHttpError";
    this.status = status;
    this.code = code;
  }
}

export function toAuthHttpError(error: unknown): AuthHttpError | null {
  if (error instanceof AuthHttpError) return error;
  if (!axios.isAxiosError(error) || !error.response) return null;

  const status = error.response.status;
  if (status === 429) {
    return new AuthHttpError(429, "rate_limit");
  }
  if (status === 401) {
    return new AuthHttpError(401, "unauthorized");
  }
  if (status === 403) {
    return new AuthHttpError(403, "forbidden");
  }
  if (status === 404) {
    return new AuthHttpError(404, "not_found");
  }
  if (status === 400) {
    return new AuthHttpError(400, "validation");
  }
  return null;
}

export function isRateLimited(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "rate_limit";
}

/** OTP invalide / expiré (reset password). */
export function isForbiddenAuth(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "forbidden";
}

export function isUnauthorized(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "unauthorized";
}

export function isValidationError(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "validation";
}

export function isNotFound(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "not_found";
}

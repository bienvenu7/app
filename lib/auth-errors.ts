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

export type ActionErrorResult = {
  __authError: {
    status: number;
    code: AuthHttpError["code"];
  };
};

export function isActionErrorResult(value: unknown): value is ActionErrorResult {
  if (!value || typeof value !== "object" || !("__authError" in value)) {
    return false;
  }
  const payload = (value as ActionErrorResult).__authError;
  return (
    !!payload &&
    typeof payload.status === "number" &&
    typeof payload.code === "string"
  );
}

/** Server actions return this instead of throwing (Next.js redacts thrown errors in prod). */
export async function withAuthError<T>(
  fn: () => Promise<T>,
): Promise<T | ActionErrorResult> {
  try {
    return await fn();
  } catch (error) {
    const mapped = toAuthHttpError(error);
    if (mapped) {
      return { __authError: { status: mapped.status, code: mapped.code } };
    }
    return { __authError: { status: 500, code: "unknown" } };
  }
}

/** Re-throw a serializable action error on the client. */
export async function unwrapAction<T>(
  promise: Promise<T | ActionErrorResult>,
): Promise<T> {
  const result = await promise;
  if (isActionErrorResult(result)) {
    throw new AuthHttpError(result.__authError.status, result.__authError.code);
  }
  return result;
}

function codeFromStatus(status: number): AuthHttpError["code"] | null {
  if (status === 429) return "rate_limit";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400) return "validation";
  return null;
}

export function toAuthHttpError(error: unknown): AuthHttpError | null {
  if (error instanceof AuthHttpError) return error;
  if (isActionErrorResult(error)) {
    return new AuthHttpError(error.__authError.status, error.__authError.code);
  }

  if (error instanceof Error) {
    const authHttp = error.message.match(/^AUTH_HTTP:(\d+):([a-z_]+)$/);
    if (authHttp) {
      const status = Number(authHttp[1]);
      const code = authHttp[2] as AuthHttpError["code"];
      return new AuthHttpError(status, code);
    }
    const asCode = error.message as AuthHttpError["code"];
    if (
      asCode === "rate_limit" ||
      asCode === "unauthorized" ||
      asCode === "forbidden" ||
      asCode === "validation" ||
      asCode === "not_found"
    ) {
      const status =
        asCode === "rate_limit"
          ? 429
          : asCode === "unauthorized"
            ? 401
            : asCode === "forbidden"
              ? 403
              : asCode === "not_found"
                ? 404
                : 400;
      return new AuthHttpError(status, asCode);
    }
  }

  if (!axios.isAxiosError(error) || !error.response) return null;

  const code = codeFromStatus(error.response.status);
  if (!code) return null;
  return new AuthHttpError(error.response.status, code);
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

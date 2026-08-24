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
  /** Seconds before the caller may retry, when the API advertises them. */
  retryAfter?: number;
  /**
   * Login 401 only: the account exists but the email is not confirmed yet.
   * Isolated here so UI never compares API message strings itself.
   */
  unconfirmedEmail?: boolean;

  constructor(
    status: number,
    code: AuthHttpError["code"],
    message?: string,
    retryAfter?: number,
    unconfirmedEmail?: boolean,
  ) {
    super(message ?? code);
    this.name = "AuthHttpError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.unconfirmedEmail = unconfirmedEmail;
  }
}

export type ActionErrorResult = {
  __authError: {
    status: number;
    code: AuthHttpError["code"];
    retryAfter?: number;
    unconfirmedEmail?: boolean;
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
        return {
          __authError: {
            status: mapped.status,
            code: mapped.code,
            retryAfter: mapped.retryAfter,
            unconfirmedEmail: mapped.unconfirmedEmail,
          },
        };
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
    throw new AuthHttpError(
      result.__authError.status,
      result.__authError.code,
      undefined,
      result.__authError.retryAfter,
      result.__authError.unconfirmedEmail,
    );
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

/**
 * Seconds left on a rate limit window. RateLimit-Reset is what the API
 * advertises; Retry-After is the standard fallback and may hold a date, which
 * we ignore rather than guess at.
 */
function retryAfterFromHeaders(headers: unknown): number | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const read = (name: string) => {
    const rec = headers as Record<string, unknown> & {
      get?: (n: string) => unknown;
    };
    const raw = typeof rec.get === "function" ? rec.get(name) : rec[name];
    const seconds = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
  };
  return read("ratelimit-reset") ?? read("retry-after");
}

export function toAuthHttpError(error: unknown): AuthHttpError | null {
  if (error instanceof AuthHttpError) return error;
  if (isActionErrorResult(error)) {
    return new AuthHttpError(
      error.__authError.status,
      error.__authError.code,
      undefined,
      error.__authError.retryAfter,
      error.__authError.unconfirmedEmail,
    );
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
  const apiMessage = messageFromResponseData(error.response.data);
  return new AuthHttpError(
    error.response.status,
    code,
    undefined,
    retryAfterFromHeaders(error.response.headers),
    isUnconfirmedEmailMessage(apiMessage),
  );
}

/**
 * 429 by IP is plain text; other errors are JSON `{ message }`. Axios already
 * try/catches JSON.parse; this still accepts either shape.
 */
function messageFromResponseData(data: unknown): string | undefined {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed || undefined;
  }
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message: unknown }).message;
    if (typeof message === "string") {
      const trimmed = message.trim();
      return trimmed || undefined;
    }
  }
  return undefined;
}

/**
 * Sole place that inspects login 401 message text. The two 401s (bad
 * credentials vs unconfirmed email) share a status; the API has no error code
 * yet. Compare only here so a backend wording change is a one-line fix.
 */
function isUnconfirmedEmailMessage(message: string | undefined): boolean {
  if (!message) return false;
  return /confirmer votre addresse email/i.test(message);
}

export function isRateLimited(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "rate_limit";
}

/** Seconds to wait before retrying, when the API said so. */
export function rateLimitRetryAfter(error: unknown): number | undefined {
  return toAuthHttpError(error)?.retryAfter;
}

/** OTP invalide / expiré (reset password). */
export function isForbiddenAuth(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "forbidden";
}

export function isUnauthorized(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "unauthorized";
}

export function isUnconfirmedEmail(error: unknown): boolean {
  return toAuthHttpError(error)?.unconfirmedEmail === true;
}

export function isValidationError(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "validation";
}

export function isNotFound(error: unknown): boolean {
  return toAuthHttpError(error)?.code === "not_found";
}

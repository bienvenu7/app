import { confirmOtp, getAuth } from "@/app/actions/auth";
import {
  isRateLimited,
  isUnauthorized,
  unwrapAction,
} from "@/lib/auth-errors";

/**
 * `verify-otp` writes auth cookies. Next then refreshes the route, which can
 * reject the server-action promise even after a 201. If get-auth succeeds,
 * the session is real and the caller should continue.
 */
export async function verifyOtpSession(
  email: string,
  code: string,
): Promise<void> {
  try {
    await unwrapAction(confirmOtp(email, code));
  } catch (error) {
    if (isRateLimited(error) || isUnauthorized(error)) throw error;
    await unwrapAction(getAuth());
  }
}

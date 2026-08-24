/** Cosmetic client cap. The server is the source of truth (5 tries per code). */
export const OTP_MAX_ATTEMPTS = 5;

export function otpAttemptsExhausted(failures: number): boolean {
  return failures >= OTP_MAX_ATTEMPTS;
}

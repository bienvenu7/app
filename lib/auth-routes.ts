/** Routes accessibles sans token JWT */
export const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/register",
  // Session read + OTP verify — not login/register, so nginx afrue_auth
  // (credential stuffing) does not apply. Must stay public: OTP runs
  // before authSession exists.
  "/auth/session",
  "/auth/verify-otp",
] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isAuthEntryRoute(pathname: string) {
  return pathname === "/auth/login" || pathname === "/auth/register";
}

export function isAuthUtilityRoute(pathname: string) {
  return (
    pathname === "/auth/session" ||
    pathname === "/auth/verify-otp" ||
    pathname.startsWith("/auth/session/") ||
    pathname.startsWith("/auth/verify-otp/")
  );
}

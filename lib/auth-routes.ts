/** Routes accessibles sans token JWT */
export const PUBLIC_ROUTES = ["/auth/login", "/auth/register"] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isAuthEntryRoute(pathname: string) {
  return pathname === "/auth/login" || pathname === "/auth/register";
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPublicRoute } from "@/lib/auth-routes";
import {
  LOCALE_COOKIE,
  isLocale,
  localeFromAcceptLanguage,
} from "@/lib/i18n/config";

/** Short-lived access JWT (≤ 15 min). */
const ACCESS_TOKEN = "accessToken";
/**
 * Session hint (7d). Lets private routes load while the client refreshes
 * access via HttpOnly `refresh` cookie — middleware cannot rely on that API cookie.
 */
const AUTH_SESSION = "authSession";

function withLocaleCookie(request: NextRequest, response: NextResponse) {
  const existing = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(existing)) return response;

  const locale = localeFromAcceptLanguage(
    request.headers.get("accept-language"),
  );
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

function hasClientSession(request: NextRequest) {
  return (
    !!request.cookies.get(ACCESS_TOKEN)?.value ||
    !!request.cookies.get(AUTH_SESSION)?.value
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasClientSession(request);
  const isPublic = isPublicRoute(pathname);

  if (!signedIn && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return withLocaleCookie(request, NextResponse.redirect(loginUrl));
  }

  if (signedIn && pathname === "/auth/register") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return withLocaleCookie(request, NextResponse.redirect(homeUrl));
  }

  return withLocaleCookie(request, NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

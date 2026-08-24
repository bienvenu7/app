import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPublicRoute } from "@/lib/auth-routes";
import { isSignedAuthSessionValid } from "@/lib/session-hint";
import {
  LOCALE_COOKIE,
  isLocale,
  localeFromAcceptLanguage,
} from "@/lib/i18n/config";

const AUTH_SESSION = "authSession";
const ACCESS_TOKEN = "accessToken";

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://va.vercel-scripts.com`,
    // 'unsafe-inline' is required here: sonner and react-toastify append a
    // <style> element at runtime, and server-rendered pages carry inline
    // style attributes. A nonce on style-src would disable both.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function withSecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  nonce: string,
) {
  // The nonce travels to the renderer on the request headers only. Echoing it
  // back on the response would hand it to anything that can read the response.
  response.headers.set("Content-Security-Policy", buildCsp(nonce));

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

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const { pathname } = request.nextUrl;
  const signedIn = await isSignedAuthSessionValid(
    request.cookies.get(AUTH_SESSION)?.value,
  );
  const isPublic = isPublicRoute(pathname);

  if (!signedIn && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return withSecurityHeaders(
      request,
      NextResponse.redirect(loginUrl),
      nonce,
    );
  }

  if (signedIn && pathname === "/auth/register") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return withSecurityHeaders(request, NextResponse.redirect(homeUrl), nonce);
  }

  return withSecurityHeaders(
    request,
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

/** Same-origin check for our own Route Handlers (server actions already enforce this). */
export function isSameOriginRequest(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (!referer) return request.method === "GET";
  try {
    return new URL(referer).host === host;
  } catch {
    return false;
  }
}

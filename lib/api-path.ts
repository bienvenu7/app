import { AuthHttpError } from "@/lib/auth-errors";

/**
 * Encode a client-supplied value used as a single URL path segment.
 *
 * `encodeURIComponent` escapes `/` but leaves `.` untouched, so a segment of
 * `..` would still resolve one level above the API base path and reach an
 * unintended upstream endpoint.
 */
export function apiPathSegment(value: string | number): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "." || raw === "..") {
    throw new AuthHttpError(400, "validation", "invalid_path_segment");
  }
  return encodeURIComponent(raw);
}

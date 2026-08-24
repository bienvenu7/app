"use client";

import { useCallback, useEffect, useState } from "react";
import { isRateLimited, rateLimitRetryAfter } from "@/lib/auth-errors";

/** When RateLimit-Reset is missing, keep the control disabled briefly. */
const FALLBACK_RETRY_SEC = 60;

/**
 * Disable a control for the window advertised by RateLimit-Reset (seconds).
 * Returns the wait in seconds so the caller can toast without waiting a render.
 */
export function useRateLimitCooldown() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const remaining =
    until && until > now ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  const locked = remaining > 0;

  useEffect(() => {
    if (!locked) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (until && until <= t) setUntil(null);
    }, 1000);
    return () => window.clearInterval(id);
  }, [locked, until]);

  const capture = useCallback((error: unknown): number | null => {
    if (!isRateLimited(error)) return null;
    const seconds = rateLimitRetryAfter(error) ?? FALLBACK_RETRY_SEC;
    setUntil(Date.now() + seconds * 1000);
    return seconds;
  }, []);

  const clear = useCallback(() => {
    setUntil(null);
  }, []);

  return { locked, remaining, capture, clear };
}

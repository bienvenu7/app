"use client";

import { useCallback, useEffect, useState } from "react";

/** Compte à rebours de validité d'un OTP (2 min login / 10 min reset). */
export function useOtpTtl(active: boolean, ttlMs: number) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const restart = useCallback(() => {
    setStartedAt(Date.now());
  }, []);

  useEffect(() => {
    if (active) {
      setStartedAt(Date.now());
      return;
    }
    setStartedAt(null);
  }, [active]);

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const remaining =
    startedAt != null
      ? Math.max(0, Math.ceil((startedAt + ttlMs - now) / 1000))
      : 0;

  return {
    remaining,
    expired: startedAt != null && remaining === 0,
    restart,
  };
}

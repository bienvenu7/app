"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCookie } from "@/config/cookies";
import { isPublicRoute } from "@/lib/auth-routes";
import {
  getValidPinAuth,
  isPinUnlockRequired,
  touchPinActivity,
} from "@/lib/storage";
import { Auth } from "@/providers/AuthContext";

const LOCK_CHECK_INTERVAL_MS = 30_000;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

export function PinLockGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const {
    state: { isLoading },
  } = Auth();

  const isPublic = isPublicRoute(pathname);

  const redirectToPinLogin = useCallback(() => {
    const from = encodeURIComponent(pathname);
    router.replace(`/auth/login?from=${from}`);
  }, [pathname, router]);

  const evaluateLock = useCallback(() => {
    if (isPublic || isLoading) return;

    const hasToken = !!getCookie("accessToken");
    if (!hasToken) return;

    const auth = getValidPinAuth();
    if (!auth || isPinUnlockRequired(auth)) {
      redirectToPinLogin();
    }
  }, [isPublic, isLoading, redirectToPinLogin]);

  const recordActivity = useCallback(() => {
    if (isPublic || isLoading) return;
    if (!getCookie("accessToken")) return;
    touchPinActivity();
  }, [isPublic, isLoading]);

  useEffect(() => {
    evaluateLock();
  }, [evaluateLock, pathname]);

  // Navigation counts as activity
  useEffect(() => {
    if (isPublic) return;
    recordActivity();
  }, [pathname, isPublic, recordActivity]);

  useEffect(() => {
    if (isPublic) return;

    const interval = window.setInterval(evaluateLock, LOCK_CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") evaluateLock();
    };

    const onActivity = () => recordActivity();

    document.addEventListener("visibilitychange", onVisible);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [evaluateLock, recordActivity, isPublic]);

  return <>{children}</>;
}

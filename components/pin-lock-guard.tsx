"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCookie } from "@/config/cookies";
import { isPublicRoute } from "@/lib/auth-routes";
import { getValidPinAuth, isPinUnlockRequired } from "@/lib/storage";
import { Auth } from "@/providers/AuthContext";

const LOCK_CHECK_INTERVAL_MS = 30_000;

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

  useEffect(() => {
    evaluateLock();
  }, [evaluateLock, pathname]);

  useEffect(() => {
    if (isPublic) return;

    const interval = window.setInterval(evaluateLock, LOCK_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluateLock();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [evaluateLock, isPublic]);

  return <>{children}</>;
}

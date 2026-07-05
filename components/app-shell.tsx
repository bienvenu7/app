"use client";

import { usePathname } from "next/navigation";
import { isPublicRoute } from "@/lib/auth-routes";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { PinLockGuard } from "@/components/pin-lock-guard";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const showChrome = !isPublicRoute(pathname);

  return (
    <PinLockGuard>
      <div
        className={`app-shell ${showChrome ? "app-shell--app" : "app-shell--auth"}`}
      >
        {showChrome && <SideNav />}
        <div className="app-content">
          {showChrome && <AppHeader />}
          {children}
          {showChrome && <BottomNav />}
        </div>
      </div>
    </PinLockGuard>
  );
}

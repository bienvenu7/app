"use client";

import { usePathname } from "next/navigation";
import { isPublicRoute } from "@/lib/auth-routes";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const showChrome = !isPublicRoute(pathname);

  return (
    <>
      {showChrome && <AppHeader />}
      {children}
      {showChrome && <BottomNav />}
    </>
  );
}

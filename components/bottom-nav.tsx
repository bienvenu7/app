"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Home, List, User } from "lucide-react";
import { useT } from "@/lib/i18n";
import styles from "./bottom-nav.module.scss";

const ICON_STROKE = 1.5;

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  const items = [
    { href: "/", label: t("nav.home"), icon: Home, match: (p: string) => p === "/" },
    {
      href: "/transfer",
      label: t("nav.transfer"),
      icon: ArrowUp,
      match: (p: string) => p.startsWith("/transfer"),
    },
    {
      href: "/transactions",
      label: t("nav.history"),
      icon: List,
      match: (p: string) => p.startsWith("/transactions"),
    },
    {
      href: "/profile",
      label: t("nav.profile"),
      icon: User,
      match: (p: string) => p.startsWith("/profile"),
    },
  ];

  if (pathname?.startsWith("/auth")) return null;

  return (
    <nav className={styles.nav} aria-label={t("nav.mainNav")}>
      <div className={styles.pill}>
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname ?? "");
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.item} ${active ? styles.active : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" strokeWidth={ICON_STROKE} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Home, List, User } from "lucide-react";
import styles from "./bottom-nav.module.scss";

const ICON_STROKE = 1.5;

const items = [
  { href: "/", label: "Accueil", icon: Home, match: (p: string) => p === "/" },
  {
    href: "/transfer",
    label: "Transfert",
    icon: ArrowUp,
    match: (p: string) => p.startsWith("/transfer"),
  },
  {
    href: "/transactions",
    label: "Historique",
    icon: List,
    match: (p: string) => p.startsWith("/transactions"),
  },
  {
    href: "/profile",
    label: "Profil",
    icon: User,
    match: (p: string) => p.startsWith("/profile"),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  if (pathname?.startsWith("/auth")) return null;

  return (
    <nav className={styles.nav} aria-label="Navigation principale">
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Home, List, User } from "lucide-react";
import { Brand } from "@/components/brand";
import { Auth } from "@/providers/AuthContext";
import styles from "./side-nav.module.scss";

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

function getInitials(fullName?: string) {
  if (!fullName?.trim()) return "··";
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SideNav() {
  const pathname = usePathname();
  const {
    state: { user },
  } = Auth();

  if (pathname?.startsWith("/auth")) return null;

  return (
    <nav className={styles.nav} aria-label="Navigation principale">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.brandWrap}>
        <Brand size="lg" />
        <p className={styles.tagline}>
          Transferts sécurisés Russie ↔ Afrique
        </p>
      </div>

      <div className={styles.links}>
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

      <div className={styles.footer}>
        <Link href="/profile" className={styles.profile} aria-label="Voir le profil">
          <span className={styles.avatar}>{getInitials(user?.fullName)}</span>
          <span className={styles.profileInfo}>
            <span className={styles.profileName}>
              {user?.fullName?.trim() || "Mon compte"}
            </span>
            <span className={styles.profileHint}>Voir le profil</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}

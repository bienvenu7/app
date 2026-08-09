"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Home, List, User } from "lucide-react";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Auth } from "@/providers/AuthContext";
import { useT } from "@/lib/i18n";
import styles from "./side-nav.module.scss";

const ICON_STROKE = 1.5;

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
  const t = useT();
  const {
    state: { user },
  } = Auth();

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
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.brandWrap}>
        <Brand size="lg" />
        <p className={styles.tagline}>{t("nav.tagline")}</p>
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
        <LanguageSwitcher className={styles.langSwitcher} />
        <Link
          href="/profile"
          className={styles.profile}
          aria-label={t("common.viewProfile")}
        >
          <span className={styles.avatar}>{getInitials(user?.fullName)}</span>
          <span className={styles.profileInfo}>
            <span className={styles.profileName}>
              {user?.fullName?.trim() || t("common.myAccount")}
            </span>
            <span className={styles.profileHint}>{t("common.viewProfile")}</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Auth } from "@/providers/AuthContext";
import { useT } from "@/lib/i18n";
import styles from "./app-header.module.scss";

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

export function AppHeader() {
  const t = useT();
  const {
    state: { user },
  } = Auth();

  return (
    <header className={styles.header}>
      <Brand />
      <div className={styles.actions}>
        <LanguageSwitcher compact variant="select" />
        <Link
          href="/profile"
          className={styles.avatar}
          aria-label={t("common.viewProfile")}
        >
          {getInitials(user?.fullName)}
        </Link>
      </div>
    </header>
  );
}

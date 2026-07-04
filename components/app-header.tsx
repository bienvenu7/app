"use client";

import Link from "next/link";
import { Brand } from "@/components/brand";
import { Auth } from "@/providers/AuthContext";
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
  const {
    state: { user },
  } = Auth();

  return (
    <header className={styles.header}>
      <Brand />
      <Link
        href="/profile"
        className={styles.avatar}
        aria-label="Voir le profil"
      >
        {getInitials(user?.fullName)}
      </Link>
    </header>
  );
}

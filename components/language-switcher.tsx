"use client";

import { ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import styles from "./language-switcher.module.scss";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "ru", label: "Русский" },
];

export function LanguageSwitcher({
  className,
  compact = false,
  variant = "button",
}: {
  className?: string;
  compact?: boolean;
  /** `select` = native dropdown (mobile logged-in); `button` = FR/RU toggle */
  variant?: "button" | "select";
}) {
  const { locale, setLocale, t } = useI18n();
  const next: Locale = locale === "fr" ? "ru" : "fr";

  if (variant === "select") {
    return (
      <label
        className={`${styles.selectWrap} ${compact ? styles.compact : ""} ${className ?? ""}`}
      >
        <span className="sr-only">{t("common.language")}</span>
        <select
          className={styles.select}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          aria-label={t("common.language")}
        >
          {OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className={styles.selectIcon}
          size={14}
          strokeWidth={2}
          aria-hidden="true"
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.switcher} ${compact ? styles.compact : ""} ${className ?? ""}`}
      onClick={() => setLocale(next)}
      aria-label={next === "ru" ? t("common.switchToRu") : t("common.switchToFr")}
      title={next === "ru" ? t("common.switchToRu") : t("common.switchToFr")}
    >
      <span className={styles.current} aria-hidden="true">
        {locale.toUpperCase()}
      </span>
      <span className={styles.divider} aria-hidden="true">
        /
      </span>
      <span className={styles.next} aria-hidden="true">
        {next.toUpperCase()}
      </span>
    </button>
  );
}

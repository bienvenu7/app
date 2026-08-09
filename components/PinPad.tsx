"use client";

import { Delete } from "lucide-react";
import styles from "./PinPad.module.scss";
import { useT } from "@/lib/i18n";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function PinPad({
  length = 5,
  value,
  onChange,
  error = false,
  disabled = false,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const t = useT();

  const handlePress = (key: string) => {
    if (disabled) return;
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    onChange(value + key);
  };

  return (
    <div>
      <div
        className={`${styles.dots} ${length > 5 ? styles.compact : ""} ${error ? styles.dotsShake : ""}`}
        role="status"
        aria-label={`${value.length} sur ${length} chiffres saisis`}
      >
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`${styles.dot} ${length > 5 ? styles.dotCompact : ""} ${i < value.length ? styles.filled : ""} ${error ? styles.shake : ""}`}
          />
        ))}
      </div>

      <div className={styles.keypad}>
        {KEYS.map((key, i) => {
          if (key === "") {
            return <span key={`empty-${i}`} className={styles.keyGhost} />;
          }
          if (key === "del") {
            return (
              <button
                key="del"
                type="button"
                className={styles.keyDelete}
                onClick={() => handlePress("del")}
                disabled={disabled || value.length === 0}
                aria-label="Effacer"
              >
                <Delete aria-hidden="true" />
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              className={styles.key}
              onClick={() => handlePress(key)}
              disabled={disabled}
              aria-label={t("pinPad.digit", { key })}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

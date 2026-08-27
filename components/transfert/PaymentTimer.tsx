"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useT } from "@/lib/i18n";
import styles from "./PaymentTimer.module.scss";

export const PAYMENT_WINDOW_MS = 30 * 60 * 1000;
const URGENT_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = "afrue-pay-deadline:";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function parseStart(startedAt?: string) {
  if (!startedAt) return NaN;
  const parsed = Date.parse(startedAt);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function resolveDeadline(txId: string | undefined, startedAt?: string) {
  const start = parseStart(startedAt);
  if (Number.isFinite(start)) return start + PAYMENT_WINDOW_MS;

  if (typeof window === "undefined") return Date.now() + PAYMENT_WINDOW_MS;

  const key = `${STORAGE_PREFIX}${txId ?? "unknown"}`;
  const stored = Number(window.sessionStorage.getItem(key));
  if (Number.isFinite(stored) && stored > 0) return stored;

  const deadline = Date.now() + PAYMENT_WINDOW_MS;
  window.sessionStorage.setItem(key, String(deadline));
  return deadline;
}

export default function PaymentTimer({
  startedAt,
  txId,
}: {
  startedAt?: string;
  txId?: string;
}) {
  const t = useT();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const deadline = resolveDeadline(txId, startedAt);
    const tick = () => setRemaining(deadline - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, txId]);

  const ms = remaining ?? PAYMENT_WINDOW_MS;
  const expired = ms <= 0;
  const urgent = !expired && ms <= URGENT_MS;
  const time = formatCountdown(ms);
  const progress = Math.max(0, Math.min(100, (ms / PAYMENT_WINDOW_MS) * 100));

  return (
    <div
      className={`${styles.banner} ${urgent ? styles.urgent : ""} ${expired ? styles.expired : ""}`}
    >
      <div className={styles.iconWrap} aria-hidden>
        <Clock size={20} strokeWidth={1.75} />
      </div>
      <div className={styles.body}>
        <div className={styles.top}>
          <span className={styles.label}>{t("validate.timerLabel")}</span>
          <span className={styles.time} aria-label={t("validate.timerAria", { time })}>
            {time}
          </span>
        </div>
        <p className={styles.hint}>
          {expired ? t("validate.timerExpired") : t("validate.timerHint")}
        </p>
        <div className={styles.track} aria-hidden>
          <span className={styles.fill} style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

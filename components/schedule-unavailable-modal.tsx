"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import styles from "./schedule-unavailable-modal.module.scss";
import { formatScheduleHour } from "@/lib/working-hours";
import { useT } from "@/lib/i18n";

export function ScheduleUnavailableModal({
  open,
  onClose,
  workingFrom,
  workingTo,
}: {
  open: boolean;
  onClose: () => void;
  workingFrom: number;
  workingTo: number;
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const fromLabel = formatScheduleHour(workingFrom);
  const toLabel = formatScheduleHour(workingTo);
  const bodyTemplate = t("schedule.body", { from: "\u0001", to: "\u0002" });
  const [bodyBefore, bodyRest = ""] = bodyTemplate.split("\u0001");
  const [bodyMid, bodyAfter = ""] = bodyRest.split("\u0002");

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <motion.div
        className={styles.modal}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-unavailable-title"
      >
        <div className={styles.header}>
          <h2 id="schedule-unavailable-title" className={styles.title}>
            {t("schedule.title")}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <p>
            {bodyBefore}
            <strong>{toLabel}</strong>
            {bodyMid}
            <strong>{fromLabel}</strong>
            {bodyAfter}
          </p>
          <p className={styles.signoff}>
            {t("schedule.signoff")}
            <br />
            {t("schedule.team")}
          </p>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.okBtn} onClick={onClose}>
            {t("schedule.understood")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

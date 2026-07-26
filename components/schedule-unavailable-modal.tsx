"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import styles from "./schedule-unavailable-modal.module.scss";
import { formatScheduleHour } from "@/lib/working-hours";

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
            Chers clients !
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <p>
            Nous vous informons que notre service sera indisponible dans la
            période de <strong>{fromLabel}</strong> à{" "}
            <strong>{toLabel}</strong> de Moscou en raison des travaux
            techniques planifiés. Nous nous excusons pour les désagréments
            temporaires.
          </p>
          <p className={styles.signoff}>
            Très respectueusement,
            <br />
            L&apos;équipe AfruE.
          </p>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.okBtn} onClick={onClose}>
            J&apos;ai compris
          </button>
        </div>
      </motion.div>
    </div>
  );
}

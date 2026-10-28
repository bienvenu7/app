"use client";

import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import styles from "./info-modal.module.scss";
import { useT } from "@/lib/i18n";

export type InfoModalAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
};

export function InfoModal({
  open,
  onClose,
  titleId,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  children: ReactNode;
  actions: InfoModalAction[];
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
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
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

        <div className={styles.body}>{children}</div>

        <div className={styles.footer}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={
                action.variant === "ghost" ? styles.ghostBtn : styles.okBtn
              }
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

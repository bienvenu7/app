"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { formatMoney, RUSSIA } from "@/lib/data";
import {
  formatTransactionStatus,
  getTransactionAmounts,
  parseTransactionRoute,
} from "@/lib/transaction-utils";
import type { ITrasanctionResponse } from "@/types/transaction";
import styles from "./transaction-details-modal.module.scss";

function formatTxDate(tx: ITrasanctionResponse) {
  if (tx.createdAt) {
    return new Date(tx.createdAt).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return tx.dateTime;
}

export function TransactionDetailsModal({
  tx,
  open,
  onClose,
}: {
  tx: ITrasanctionResponse;
  open: boolean;
  onClose: () => void;
}) {
  const { from, to } = parseTransactionRoute(tx.code);
  const sourceCountry = from ?? RUSSIA;
  const destCountry = to ?? RUSSIA;
  const amounts = getTransactionAmounts(tx, from, to);
  const paymentLabel =
    tx.Network?.pubicName ?? tx.Network?.name ?? tx.networkId;

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
    <div
      className={styles.overlay}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        className={styles.modal}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-details-title"
      >
        <div className={styles.header}>
          <h2 id="tx-details-title" className={styles.title}>
            Détails du transfert
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
          <div className={styles.route}>
            <div className={styles.routeSide}>
              <span className={styles.flag}>{sourceCountry.flag}</span>
              <span className={styles.countryName}>{sourceCountry.name}</span>
            </div>
            <ArrowRight className={styles.routeArrow} size={20} />
            <div className={`${styles.routeSide} ${styles.right}`}>
              <span className={styles.flag}>{destCountry.flag}</span>
              <span className={styles.countryName}>{destCountry.name}</span>
            </div>
          </div>

          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Référence</span>
              <span className={styles.rowValue}>{tx.txid}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Type</span>
              <span className={styles.rowValue}>
                {tx.type === "SEND" ? "Envoi" : "Réception"}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Statut</span>
              <span className={styles.rowValue}>
                {formatTransactionStatus(tx.status)}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Date</span>
              <span className={styles.rowValue}>{formatTxDate(tx)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Expéditeur</span>
              <span className={styles.rowValue}>{tx.senderName}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Destinataire</span>
              <span className={styles.rowValue}>{tx.receiverName}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Téléphone</span>
              <span className={styles.rowValue}>{tx.receiverPhone}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Réseau</span>
              <span className={styles.rowValue}>{paymentLabel}</span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Montant</span>
              <span className={styles.rowValue}>
                {formatMoney(amounts.baseAmount, sourceCountry)}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Frais</span>
              <span className={styles.rowValue}>
                {formatMoney(amounts.fees, sourceCountry)}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Total payé</span>
              <span className={`${styles.rowValue} ${styles.gold}`}>
                {formatMoney(amounts.totalAmount, sourceCountry)}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Montant reçu</span>
              <span className={`${styles.rowValue} ${styles.gold}`}>
                {formatMoney(amounts.received, destCountry)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

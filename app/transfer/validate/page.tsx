"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  Check,
  Download,
  Receipt,
  X,
  ImageIcon,
} from "lucide-react";
import moment from "moment";
import { toast } from "sonner";
import styles from "./validate.module.scss";
import { formatMoney, RUSSIA } from "@/lib/data";
import { generateReceipt } from "@/lib/receipt";
import {
  getTransactionAmounts,
  isProcessingStatus,
  isTransactionPaid,
  isWaitingStatus,
  parseTransactionRoute,
  toReceiptTransaction,
} from "@/lib/transaction-utils";
import Loading from "@/components/Loading";
import { Auth } from "@/providers/AuthContext";
import {
  useGetTransactonById,
  useUpdateTransaction,
} from "@/hooks/useTransaction";
import { uploafFile } from "@/app/actions/file";
import type { ITrasanctionResponse } from "@/types/transaction";
import { Status } from "@/types/transaction";

function ValidateFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const txId = params.get("id") ?? undefined;

  const {
    state: { user },
  } = Auth();

  const { transaction, isGettingTransaction, isTransactionError } =
    useGetTransactonById(txId);
  const { mutateAsync: updateTx, isUpdatingTransaction } =
    useUpdateTransaction();

  const [paidLocally, setPaidLocally] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const tx = transaction as ITrasanctionResponse | undefined;

  const { from, to } = useMemo(
    () => parseTransactionRoute(tx?.code),
    [tx?.code],
  );

  const amounts = useMemo(
    () => (tx ? getTransactionAmounts(tx, from, to) : null),
    [tx, from, to],
  );

  const isWaiting = isWaitingStatus(tx?.status);
  const isProcessing = isProcessingStatus(tx?.status);

  const showSuccess =
    paidLocally || (tx ? isTransactionPaid(tx.status) : false);

  const canPay = tx && isWaiting && !showSuccess;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image (JPG, PNG, etc.).");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setProofFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearProof = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setProofFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConfirm = async () => {
    if (!tx || !txId) return;
    if (!proofFile) {
      toast.error("Ajoutez une capture d'écran de votre paiement.");
      return;
    }

    try {
      await uploafFile(proofFile, tx.id ?? txId, "Preuve de paiement");
      await updateTx({
        transactionId: tx.id ?? txId,
        senderNumber: user?.whatsappNumber?.trim() ?? "",
        hour: moment().format("HH:mm"),
        status: Status.INPROGRESS,
      });
      setPaidLocally(true);
      toast.success("Paiement enregistré, votre transfert est en cours.");
    } catch {
      toast.error("Impossible de confirmer le paiement. Réessayez.");
    }
  };

  if (txId && isGettingTransaction) {
    return (
      <main>
        <Loading />
      </main>
    );
  }

  if (!txId) {
    return (
      <main>
        <div className={styles.empty}>
          <p>Aucun transfert en attente de validation.</p>
          <button
            className={styles.ghostBtn}
            style={{ marginTop: 20 }}
            onClick={() => router.push("/transfer")}
          >
            Nouveau transfert
          </button>
        </div>
      </main>
    );
  }

  if (isTransactionError || !tx || !amounts) {
    return (
      <main>
        <div className={styles.empty}>
          <p>Transfert introuvable ou inaccessible.</p>
          <button
            className={styles.ghostBtn}
            style={{ marginTop: 20 }}
            onClick={() => router.push("/transfer")}
          >
            Nouveau transfert
          </button>
        </div>
      </main>
    );
  }

  const receiptTx = toReceiptTransaction(tx);
  const paymentLabel =
    tx.Network?.pubicName ?? tx.Network?.name ?? tx.networkId;
  const sourceCountry = from ?? RUSSIA;
  const destCountry = to ?? RUSSIA;

  if (showSuccess) {
    return (
      <main>
        <motion.div
          className={styles.success}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className={styles.checkCircle}
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 15 }}
          >
            <Check size={44} strokeWidth={3} />
          </motion.div>
          <h1 className={styles.successTitle}>
            Paiement <em>validé</em>
          </h1>
          <p className={styles.successText}>
            Votre transfert de {formatMoney(tx.amountToPayOut, destCountry)} a
            été traité avec succès.
          </p>
          <span className={styles.txidPill}>{tx.txid}</span>

          <div className={styles.successActions}>
            <button
              className={styles.payBtn}
              onClick={() => generateReceipt(receiptTx)}
            >
              <Download size={18} /> Télécharger le reçu
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => router.push("/transactions")}
            >
              <Receipt size={18} /> Voir mes transactions
            </button>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main>
      <div className={styles.wrap}>
        <button className={styles.back} onClick={() => router.push("/transfer")}>
          <ArrowLeft size={16} /> Retour
        </button>

        <h1 className={styles.title}>
          Valider le <em>transfert</em>
        </h1>
        <p className={styles.subtitle}>
          Vérifiez les informations avant de confirmer le paiement.
        </p>

        <div className={styles.card}>
          <div className={styles.route}>
            <div className={styles.routeSide}>
              <span className={styles.flag}>{sourceCountry.flag}</span>
              <span className={styles.countryName}>{sourceCountry.name}</span>
            </div>
            <ArrowRight className={styles.routeArrow} size={22} />
            <div className={`${styles.routeSide} ${styles.right}`}>
              <span className={styles.flag}>{destCountry.flag}</span>
              <span className={styles.countryName}>{destCountry.name}</span>
            </div>
          </div>

          <div className={styles.route}>
            <div className={styles.amountBlock}>
              <span className={styles.amountLabel}>Envoyé</span>
              <span className={styles.amountValue}>
                {formatMoney(amounts.baseAmount, sourceCountry)}
              </span>
            </div>
            <div className={styles.amountBlock} style={{ textAlign: "right" }}>
              <span className={styles.amountLabel}>Reçu</span>
              <span className={`${styles.amountValue} ${styles.gold}`}>
                {formatMoney(amounts.received, destCountry)}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Destinataire</p>
          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Nom</span>
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
        </div>

        {tx.card && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>Compte de paiement</p>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Titulaire</span>
                <span className={styles.rowValue}>{tx.card.fullName}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Numéro</span>
                <span className={styles.rowValue}>{tx.card.phone}</span>
              </div>
            </div>
          </div>
        )}

        {isProcessing && !showSuccess && (
          <div className={styles.processing}>
            <span className={styles.spinner} />
            <p>Paiement en cours de validation par notre équipe.</p>
          </div>
        )}

        {canPay && (
          <div className={styles.payBar}>
            <div className={styles.total}>
              <span className={styles.totalLabel}>Total à payer</span>
              <span className={styles.totalValue}>
                {formatMoney(amounts.totalAmount, sourceCountry)}
              </span>
            </div>
            <button className={styles.payBtn} type="button">
              <Lock size={18} /> Payer{" "}
              {formatMoney(amounts.totalAmount, sourceCountry)}
            </button>

            <div className={styles.proofSection}>
              <p className={styles.proofLabel}>Preuve de paiement</p>
              <p className={styles.proofHint}>
                Ajoutez une capture d&apos;écran de votre transaction.
              </p>

              <input
                ref={fileInputRef}
                id="proofFile"
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={handleFileChange}
              />

              {previewUrl ? (
                <div className={styles.previewWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Aperçu de la preuve de paiement"
                    className={styles.previewImage}
                  />
                  <button
                    type="button"
                    className={styles.removePreview}
                    onClick={clearProof}
                    aria-label="Supprimer l'image"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label htmlFor="proofFile" className={styles.uploadZone}>
                  <ImageIcon size={28} className={styles.uploadIcon} />
                  <span>Choisir une image</span>
                  <span className={styles.uploadFormats}>JPG, PNG, WEBP</span>
                </label>
              )}
            </div>

            <button
              className={styles.confirmBtn}
              type="button"
              onClick={handleConfirm}
              disabled={isUpdatingTransaction || !proofFile}
            >
              {isUpdatingTransaction ? (
                <>
                  <span className={styles.spinner} /> Confirmation en cours...
                </>
              ) : (
                <>
                  <Check size={18} /> Confirmer
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ValidatePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ValidateFlow />
    </Suspense>
  );
}

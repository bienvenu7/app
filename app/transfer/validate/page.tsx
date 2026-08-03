"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  Hourglass,
  Receipt,
  X,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import styles from "./validate.module.scss";
import { formatMoney, RUSSIA } from "@/lib/data";
import { getLinks } from "@/lib/payment-networks";
import {
  getTransactionAmounts,
  isProcessingStatus,
  isTransactionPaid,
  isWaitingStatus,
  parseTransactionRoute,
} from "@/lib/transaction-utils";
import Loading from "@/components/Loading";
import { TransactionDetailsModal } from "@/components/transaction-details-modal";
import { Auth } from "@/providers/AuthContext";
import {
  useGetTransactonById,
  useUpdateTransaction,
  invalidateTransactionQueries,
} from "@/hooks/useTransaction";
import { uploadFiles } from "@/app/actions/file";
import {
  compressImageFilesForUpload,
  formatFileSize,
  MAX_SINGLE_REQUEST_BYTES,
} from "@/lib/compress-image";
import axios from "axios";
import type { ITrasanctionResponse } from "@/types/transaction";
import { Status } from "@/types/transaction";
import { useGetCards, useGetCountries } from "@/hooks/useCountry";
import { ICountry } from "@/types/country";
import type { IResponseCard } from "@/types/networks";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

type StatusVariant = "progress" | "confirmed" | "success" | "error";

function isErrorStatus(status: Status | string | undefined) {
  return status === Status.ERROR || status === "ERROR";
}

function getTransferStatusView(
  status: Status | string | undefined,
  amountLabel: string,
) {
  if (isErrorStatus(status)) {
    return {
      variant: "error" as StatusVariant,
      titleEm: "échoué",
      text: `Votre transfert de ${amountLabel} a échoué. Veuillez réessayer ou contacter le support.`,
    };
  }

  if (status === Status.FINISH || status === "FINISH") {
    return {
      variant: "success" as StatusVariant,
      titleEm: "réussi",
      text: `Votre transfert de ${amountLabel} a été effectué avec succès.`,
    };
  }

  if (status === Status.CONFIRMED || status === "CONFIRMED") {
    return {
      variant: "confirmed" as StatusVariant,
      titleEm: "confirmé",
      text: `Votre transfert de ${amountLabel} a été confirmé et sera bientôt finalisé.`,
    };
  }

  return {
    variant: "progress" as StatusVariant,
    titleEm: "en cours",
    text: `Votre transfert de ${amountLabel} est en cours de traitement. Vous serez notifié dès qu'il sera terminé.`,
  };
}

function TransferStatusIcon({ variant }: { variant: StatusVariant }) {
  return (
    <div
      className={`${styles.progressRing} ${styles[`ring_${variant}`]}`}
      aria-hidden
    >
      <svg className={styles.progressRingSvg} viewBox="0 0 96 96">
        <circle className={styles.progressTrack} cx="48" cy="48" r="42" />
        <circle className={styles.progressArc} cx="48" cy="48" r="42" />
      </svg>
      <div className={styles.progressInner}>
        {variant === "progress" ? (
          <>
            <Hourglass size={26} strokeWidth={1.75} />
            <div className={styles.progressDots}>
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className={styles.progressDot} />
              ))}
            </div>
          </>
        ) : variant === "error" ? (
          <X size={34} strokeWidth={2.25} />
        ) : (
          <Check size={34} strokeWidth={2.25} />
        )}
      </div>
    </div>
  );
}

function ValidateFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const txId = params.get("id") ?? undefined;

  const {
    state: { user },
  } = Auth();

  const { countries } = useGetCountries();

  const { transaction, isGettingTransaction, isTransactionError, refetch } =
    useGetTransactonById(txId);

  const { isUpdatingTransaction } = useUpdateTransaction();
  const queryClient = useQueryClient();

  const [paidLocally, setPaidLocally] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [proofFiles, setProofFiles] = useState<
    { file: File; previewUrl: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      proofFiles.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    };
  }, [proofFiles]);

  const tx = transaction as ITrasanctionResponse | undefined;

  const { from, to, fromCode } = useMemo(
    () => parseTransactionRoute(tx?.code),
    [tx?.code],
  );

  const countryFrom = useMemo(() => {
    return (countries as ICountry[])?.find(
      (country: ICountry) => country.name === fromCode,
    );
  }, [countries, fromCode]);

  const { cards, isLoading: isLoadingCards } = useGetCards(countryFrom?.id);

  const paymentCards = useMemo(
    () =>
      (cards as IResponseCard[] | undefined)?.filter((card) => card.isActive),
    [cards],
  );

  const amounts = useMemo(
    () => (tx ? getTransactionAmounts(tx, from, to) : null),
    [tx, from, to],
  );

  const isWaiting = isWaitingStatus(tx?.status);
  const isProcessing = isProcessingStatus(tx?.status);
  const isError = isErrorStatus(tx?.status);
  const isPaid = tx ? isTransactionPaid(tx.status) : false;

  const showStatusScreen =
    paidLocally || isProcessing || isPaid || isError;

  const canPay = tx && isWaiting && !showStatusScreen;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const invalid = files.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      toast.error(
        "Veuillez sélectionner uniquement des images (JPG, PNG, etc.).",
      );
      return;
    }

    const newEntries = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setProofFiles((prev) => [...prev, ...newEntries]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeProof = (index: number) => {
    setProofFiles((prev) => {
      const entry = prev[index];
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleCopyPayment = async (text: string) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié dans le presse-papiers");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const markPaymentConfirmed = async () => {
    setPaidLocally(true);
    await invalidateTransactionQueries(queryClient);
    toast.success("Paiement enregistré, votre transfert est en cours.");
  };

  const handleConfirm = async () => {
    if (!tx || !txId || isSubmitting) return;
    if (!proofFiles.length) {
      toast.error("Ajoutez au moins une capture d'écran de votre paiement.");
      return;
    }

    const transactionId = tx.id ?? txId;
    setIsSubmitting(true);

    try {
      const compressedFiles = await compressImageFilesForUpload(
        proofFiles.map(({ file }) => file),
      );

      const totalBytes = compressedFiles.reduce(
        (sum, file) => sum + file.size,
        0,
      );

      if (totalBytes > MAX_SINGLE_REQUEST_BYTES) {
        toast.error(
          `Les images restent trop volumineuses (${formatFileSize(totalBytes)}). Réduisez le nombre de fichiers.`,
        );
        return;
      }

      await uploadFiles(compressedFiles, transactionId, "Preuve de paiement");
      await markPaymentConfirmed();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 413) {
        toast.error(
          "Les images sont trop volumineuses. Essayez avec moins de fichiers ou des captures plus légères.",
        );
        return;
      }

      const { data: updatedTx } = await refetch();
      if (updatedTx && !isWaitingStatus(updatedTx.status)) {
        await markPaymentConfirmed();
        return;
      }
      toast.error("Impossible de confirmer le paiement. Réessayez.");
    } finally {
      setIsSubmitting(false);
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

  const paymentLabel =
    tx.Network?.pubicName ?? tx.Network?.name ?? tx.networkId;
  const sourceCountry = from ?? RUSSIA;
  const destCountry = to ?? RUSSIA;

  if (showStatusScreen) {
    const amountLabel = formatMoney(tx.amountToPayOut, destCountry);
    const statusView = getTransferStatusView(tx.status, amountLabel);

    return (
      <main>
        <motion.div
          className={`${styles.success} ${styles[`status_${statusView.variant}`]}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            key={statusView.variant}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 15 }}
          >
            <TransferStatusIcon variant={statusView.variant} />
          </motion.div>
          <h1 className={styles.successTitle}>
            Transfert <em>{statusView.titleEm}</em>
          </h1>
          <p className={styles.successText}>{statusView.text}</p>
          <span className={styles.txidPill}>{tx.txid}</span>

          <div className={styles.successActions}>
            <button
              className={styles.payBtn}
              onClick={() => setShowDetails(true)}
            >
              <Eye size={18} /> Voir les détails
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => router.push("/transactions")}
            >
              <Receipt size={18} /> Voir mes transactions
            </button>
          </div>
        </motion.div>

        <TransactionDetailsModal
          tx={tx}
          open={showDetails}
          onClose={() => setShowDetails(false)}
        />
      </main>
    );
  }

  return (
    <main>
      <div className={styles.wrap}>
        <button
          className={styles.back}
          onClick={() => router.push("/transfer")}
        >
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

        {isProcessing && !showStatusScreen && (
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
            <div className={styles.payMethods}>
              <p className={styles.payMethodsTitle}>Moyen de paiement</p>
              {isLoadingCards ? (
                <p className={styles.payMethodsHint}>
                  Chargement des options de paiement...
                </p>
              ) : paymentCards?.length ? (
                <div className={styles.payMethodsList}>
                  {paymentCards.map((el) => {
                    const networkFlag = getLinks(el.network.name);
                    const isSbpLogo = networkFlag?.includes("sbp-logo");

                    return el.isLink ? (
                      <Link
                        key={el.id}
                        className={`${styles.payLink} ${isSbpLogo ? styles.payLinkSbp : ""}`}
                        href={el.content || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {networkFlag ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={networkFlag}
                            alt={el.network.pubicName}
                            className={isSbpLogo ? styles.payLinkSbpImg : undefined}
                          />
                        ) : (
                          `Payez avec ${el.network.pubicName}`
                        )}
                      </Link>
                    ) : (
                      <div key={el.id} className={styles.payContainer}>
                        <span className={styles.payContent}>
                          {networkFlag ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={networkFlag}
                              alt={el.network.name}
                              className={
                                isSbpLogo
                                  ? styles.payNetworkImgSbp
                                  : styles.payNetworkImg
                              }
                            />
                          ) : (
                            <strong>{el.network.name} : </strong>
                          )}
                          {el.content || ""}
                        </span>
                        <button
                          type="button"
                          className={styles.copyBtn}
                          aria-label="Copier les instructions de paiement"
                          onClick={() => handleCopyPayment(el.content || "")}
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.payMethodsHint}>
                  Aucun moyen de paiement disponible pour ce pays.
                </p>
              )}
            </div>

            <div className={styles.proofSection}>
              <p className={styles.proofLabel}>Preuve de paiement</p>
              <p className={styles.proofHint}>
                Ajoutez une ou plusieurs captures d&apos;écran de votre
                transaction.
              </p>

              <input
                ref={fileInputRef}
                id="proofFile"
                type="file"
                accept="image/*"
                multiple
                className={styles.fileInput}
                onChange={handleFileChange}
              />

              {proofFiles.length > 0 && (
                <div className={styles.previewList}>
                  {proofFiles.map(({ previewUrl }, index) => (
                    <div key={previewUrl} className={styles.previewWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt={`Aperçu de la preuve de paiement ${index + 1}`}
                        className={styles.previewImage}
                      />
                      <button
                        type="button"
                        className={styles.removePreview}
                        onClick={() => removeProof(index)}
                        aria-label={`Supprimer l'image ${index + 1}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label htmlFor="proofFile" className={styles.uploadZone}>
                <ImageIcon size={28} className={styles.uploadIcon} />
                <span>
                  {proofFiles.length > 0
                    ? "Ajouter d'autres images"
                    : "Choisir des images"}
                </span>
                <span className={styles.uploadFormats}>JPG, PNG, WEBP</span>
              </label>
            </div>

            <button
              className={styles.confirmBtn}
              type="button"
              onClick={handleConfirm}
              disabled={
                isSubmitting || isUpdatingTransaction || !proofFiles.length
              }
            >
              {isSubmitting || isUpdatingTransaction ? (
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

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
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/dictionaries";

type StatusVariant = "progress" | "confirmed" | "success" | "error";

function isErrorStatus(status: Status | string | undefined) {
  return status === Status.ERROR || status === "ERROR";
}

function getTransferStatusView(
  status: Status | string | undefined,
  amountLabel: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
) {
  if (isErrorStatus(status)) {
    return {
      variant: "error" as StatusVariant,
      titleEm: t("validate.failedEm"),
      text: t("validate.failedText", { amount: amountLabel }),
    };
  }

  if (status === Status.FINISH || status === "FINISH") {
    return {
      variant: "success" as StatusVariant,
      titleEm: t("validate.successEm"),
      text: t("validate.successText", { amount: amountLabel }),
    };
  }

  if (status === Status.CONFIRMED || status === "CONFIRMED") {
    return {
      variant: "confirmed" as StatusVariant,
      titleEm: t("validate.confirmedEm"),
      text: t("validate.confirmedText", { amount: amountLabel }),
    };
  }

  return {
    variant: "progress" as StatusVariant,
    titleEm: t("validate.progressEm"),
    text: t("validate.progressText", { amount: amountLabel }),
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
  const t = useT();
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
      toast.error(t("validate.imagesOnly"));
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
      toast.success(t("validate.copied"));
    } catch {
      toast.error(t("validate.copyError"));
    }
  };

  const markPaymentConfirmed = async () => {
    setPaidLocally(true);
    await invalidateTransactionQueries(queryClient);
    toast.success(t("validate.paymentSaved"));
  };

  const handleConfirm = async () => {
    if (!tx || !txId || isSubmitting) return;
    if (!proofFiles.length) {
      toast.error(t("validate.addProof"));
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
          t("validate.tooLarge", { size: formatFileSize(totalBytes) }),
        );
        return;
      }

      await uploadFiles(compressedFiles, transactionId, t("validate.proofLabel"));
      await markPaymentConfirmed();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 413) {
        toast.error(t("validate.tooLargeRetry"));
        return;
      }

      const { data: updatedTx } = await refetch();
      if (updatedTx && !isWaitingStatus(updatedTx.status)) {
        await markPaymentConfirmed();
        return;
      }
      toast.error(t("validate.confirmError"));
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
          <p>{t("validate.noPending")}</p>
          <button
            className={styles.ghostBtn}
            style={{ marginTop: 20 }}
            onClick={() => router.push("/transfer")}
          >
            {t("transfer.newTransfer")}
          </button>
        </div>
      </main>
    );
  }

  if (isTransactionError || !tx || !amounts) {
    return (
      <main>
        <div className={styles.empty}>
          <p>{t("validate.notFound")}</p>
          <button
            className={styles.ghostBtn}
            style={{ marginTop: 20 }}
            onClick={() => router.push("/transfer")}
          >
            {t("transfer.newTransfer")}
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
    const statusView = getTransferStatusView(tx.status, amountLabel, t);

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
            {t("validate.transferLabel")} <em>{statusView.titleEm}</em>
          </h1>
          <p className={styles.successText}>{statusView.text}</p>
          <span className={styles.txidPill}>{tx.txid}</span>

          <div className={styles.successActions}>
            <button
              className={styles.payBtn}
              onClick={() => setShowDetails(true)}
            >
              <Eye size={18} /> {t("validate.viewDetails")}
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => router.push("/transactions")}
            >
              <Receipt size={18} /> {t("validate.viewMyTransactions")}
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
          <ArrowLeft size={16} /> {t("common.back")}
        </button>

        <h1 className={styles.title}>
          {t("validate.title")} <em>{t("validate.titleEm")}</em>
        </h1>
        <p className={styles.subtitle}>{t("validate.subtitle")}</p>

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
              <span className={styles.amountLabel}>{t("validate.sent")}</span>
              <span className={styles.amountValue}>
                {formatMoney(amounts.totalAmount, sourceCountry)}
              </span>
            </div>
            <div className={styles.amountBlock} style={{ textAlign: "right" }}>
              <span className={styles.amountLabel}>{t("validate.received")}</span>
              <span className={`${styles.amountValue} ${styles.gold}`}>
                {formatMoney(amounts.received, destCountry)}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>{t("txDetails.recipient")}</p>
          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t("common.lastName")}</span>
              <span className={styles.rowValue}>{tx.receiverName}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t("common.phone")}</span>
              <span className={styles.rowValue}>{tx.receiverPhone}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t("txDetails.network")}</span>
              <span className={styles.rowValue}>{paymentLabel}</span>
            </div>
          </div>
        </div>

        {tx.card && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>{t("validate.paymentAccount")}</p>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t("validate.holder")}</span>
                <span className={styles.rowValue}>{tx.card.fullName}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t("validate.number")}</span>
                <span className={styles.rowValue}>{tx.card.phone}</span>
              </div>
            </div>
          </div>
        )}

        {isProcessing && !showStatusScreen && (
          <div className={styles.processing}>
            <span className={styles.spinner} />
            <p>{t("validate.processing")}</p>
          </div>
        )}

        {canPay && (
          <div className={styles.payBar}>
            <div className={styles.total}>
              <span className={styles.totalLabel}>{t("transfer.totalToPay")}</span>
              <span className={styles.totalValue}>
                {formatMoney(amounts.totalAmount, sourceCountry)}
              </span>
            </div>
            <div className={styles.payMethods}>
              <p className={styles.payMethodsTitle}>{t("validate.paymentMethod")}</p>
              {isLoadingCards ? (
                <p className={styles.payMethodsHint}>
                  {t("validate.loadingPayment")}
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
                          t("validate.payWith", { name: el.network.pubicName })
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
                          aria-label={t("validate.copyPaymentAria")}
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
                  {t("validate.noPaymentMethods")}
                </p>
              )}
            </div>

            <div className={styles.proofSection}>
              <p className={styles.proofLabel}>{t("validate.proofLabel")}</p>
              <p className={styles.proofHint}>{t("validate.proofHint")}</p>

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
                        alt={t("validate.proofPreview", { n: index + 1 })}
                        className={styles.previewImage}
                      />
                      <button
                        type="button"
                        className={styles.removePreview}
                        onClick={() => removeProof(index)}
                        aria-label={t("validate.removeImage", { n: index + 1 })}
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
                    ? t("validate.addMoreImages")
                    : t("validate.chooseImages")}
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
                  <span className={styles.spinner} /> {t("validate.confirming")}
                </>
              ) : (
                <>
                  <Check size={18} /> {t("common.confirm")}
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

"use client";

import { AFRICAN_COUNTRIES, Country, formatMoney, computeTransferAmounts } from "@/lib/data";
import { TransferType } from "@/lib/storage";
import styles from "@/app/transfer/transfer.module.scss";
import { ArrowDown, Lock } from "lucide-react";
import { IClientResponse } from "@/types/user";
import { IDirection, IRate } from "@/types/country";
import { useT } from "@/lib/i18n";

export default function AmountStep({
  type,
  africanCode,
  setAfricanCode,
  amount,
  setAmount,
  from,
  to,
  quote,
  amountNum,
  user,
  rateData,
  iltineraire,
  feesIncluded,
  setFeesIncluded,
}: {
  type: TransferType;
  africanCode: string;
  setAfricanCode: (c: string) => void;
  amount: string;
  setAmount: (a: string) => void;
  from: Country;
  to: Country;
  quote: { fee: number; received: number };
  amountNum: number;
  user: IClientResponse;
  rateData: IRate;
  iltineraire: IDirection;
  feesIncluded: boolean;
  setFeesIncluded: (v: boolean) => void;
}) {
  const t = useT();
  const pickerLabel =
    type === "send"
      ? t("transfer.recipientCountry")
      : t("transfer.senderCountry");

  const rate = parseFloat(rateData?.taux ?? "0");
  const { fee, totalToPay, amountToPayOut } = computeTransferAmounts(
    amountNum,
    iltineraire?.fee || 0,
    rate,
    feesIncluded,
  );

  const isAmountOutOfRange =
    !!iltineraire &&
    amountNum > 0 &&
    (amountNum < iltineraire.min || amountNum > iltineraire.max);

  const amountError = !iltineraire
    ? null
    : amountNum > 0 && amountNum < iltineraire.min
      ? t("transfer.minError", {
          amount: formatMoney(iltineraire.min, from),
        })
      : amountNum > iltineraire.max
        ? t("transfer.maxError", {
            amount: formatMoney(iltineraire.max, from),
          })
        : null;

  return (
    <div>
      <h2 className={styles.stepTitle}>{pickerLabel}</h2>
      <p className={styles.stepDesc}>
        {type === "send"
          ? t("transfer.selectRecipientCountry")
          : t("transfer.selectSenderCountry")}
      </p>

      <div className={styles.fixedSide}>
        <span className={styles.flag}>
          {type === "send" ? from.flag : to.flag}
        </span>
        <div>
          <div className={styles.fLabel}>
            {type === "send" ? t("transfer.sender") : t("transfer.recipient")}
          </div>
          <div className={styles.fName}>
            {type === "send" ? from.name : to.name}
          </div>
        </div>
        <span className={styles.lock}>
          <Lock aria-hidden="true" />
        </span>
      </div>

      <span className={styles.label}>{pickerLabel}</span>
      <div className={styles.countryList}>
        {AFRICAN_COUNTRIES.filter((r) => r.code !== user.Country.name).map(
          (c) => (
            <button
              key={c.code}
              className={`${styles.countryChip} ${africanCode === c.code ? styles.selected : ""}`}
              onClick={() => setAfricanCode(c.code)}
            >
              <span className={styles.flag}>{c.flag}</span>
              <span className={styles.cn}>{c.name}</span>
            </button>
          ),
        )}
      </div>

      <div className={`${styles.amountBox} ${isAmountOutOfRange ? styles.amountBoxInvalid : ""}`}>
        <div className={styles.amountLabel}>
          <span>{t("transfer.youSend", { country: from.name })}</span>
        </div>
        <div className={styles.amountInput}>
          <input
            type="number"
            inputMode="decimal"
            placeholder={t("transfer.minPlaceholder", {
              min: iltineraire?.min || 0,
            })}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label={t("transfer.amountAria")}
            aria-invalid={isAmountOutOfRange}
            aria-describedby={amountError ? "amount-range-error" : undefined}
            className={isAmountOutOfRange ? styles.amountInvalid : undefined}
          />
          <span className={styles.cur}>{from.currency}</span>
        </div>
        {amountError && (
          <p id="amount-range-error" className={styles.amountError} role="alert">
            {amountError}
          </p>
        )}
      </div>

      <div className={styles.swapLine}>
        <span className={styles.swapIcon}>
          <ArrowDown aria-hidden="true" />
        </span>
      </div>

      <div className={`${styles.amountBox} ${styles.received}`}>
        <div className={styles.amountLabel}>
          <span>
            {t("transfer.recipientReceives", { country: to.name })}
          </span>
        </div>
        <div className={styles.amountInput}>
          <span className={styles.amountValue}>
            {amountNum > 0
              ? formatMoney(amountToPayOut, to)
              : `0 ${to.symbol}`}
          </span>
        </div>
      </div>

      {amountNum > 0 && (
        <>
          <span className={styles.label}>{t("transfer.transferFees")}</span>
          <div className={styles.feeOptions}>
            <button
              type="button"
              className={`${styles.feeOption} ${!feesIncluded ? styles.selected : ""}`}
              onClick={() => setFeesIncluded(false)}
            >
              <span className={styles.feeOptionTitle}>
                {t("transfer.feesExtra")}
              </span>
              <span className={styles.feeOptionHint}>
                {t("transfer.feesExtraHint")}
              </span>
            </button>
            <button
              type="button"
              className={`${styles.feeOption} ${feesIncluded ? styles.selected : ""}`}
              onClick={() => setFeesIncluded(true)}
            >
              <span className={styles.feeOptionTitle}>
                {t("transfer.feesIncluded")}
              </span>
              <span className={styles.feeOptionHint}>
                {t("transfer.feesIncludedHint")}
              </span>
            </button>
          </div>

          <div className={styles.breakdown}>
            <div className={styles.brow}>
              <span>{t("transfer.amount")}</span>
              <strong>{formatMoney(amountToPayOut, to)}</strong>
            </div>
            <div className={styles.brow}>
              <span>{t("transfer.feesPercent", { fee: iltineraire?.fee })}</span>
              <strong>{formatMoney(fee, from)}</strong>
            </div>
            <div className={styles.divider} />
            <div className={styles.brow}>
              <span>{t("transfer.totalToPay")}</span>
              <strong>{formatMoney(totalToPay, from)}</strong>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

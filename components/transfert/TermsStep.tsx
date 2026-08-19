"use client";

import { Country, formatMoney, computeTransferAmounts } from "@/lib/data";
import { IDirection, IRate } from "@/types/country";
import styles from "@/app/transfer/transfer.module.scss";
import { Check } from "lucide-react";
import { INetworkResponse } from "@/types/networks";
import { useT } from "@/lib/i18n";

export default function TermsStep({
  accepted,
  setAccepted,
  from,
  to,
  amountNum,
  quote,
  amount,
  rateData,
  iltineraire,
  feesIncluded,
  recipientName,
  selectedNetwork,
  recipientPhone,
  receiveAmount,
}: {
  accepted: boolean;
  setAccepted: (v: boolean) => void;
  from: Country;
  to: Country;
  amountNum: number;
  quote: { fee: number; received: number };
  amount: string;
  receiveAmount: string;
  rateData: IRate;
  iltineraire: IDirection;
  feesIncluded: boolean;
  recipientName: string;
  selectedNetwork: INetworkResponse;
  recipientPhone: string;
}) {
  const t = useT();
  const rate = parseFloat(rateData?.taux ?? "0");
  const { fee, totalToPay, convertAmount, amountToPayOut } =
    computeTransferAmounts(
      amountNum,
      iltineraire?.fee || 0,
      rate,
      feesIncluded,
    );

  const effectiveAmountToPayOut = parseInt(receiveAmount, 10) || amountToPayOut;
  return (
    <div>
      <h2 className={styles.stepTitle}>{t("transfer.termsTitle")}</h2>
      <p className={styles.stepDesc}>{t("transfer.termsDesc")}</p>

      <div className={styles.terms}>
        <h3>{t("transfer.contractTitle")}</h3>
        <ul>
          <li>
            {t("transfer.payFrom", {
              amount: formatMoney(totalToPay, from),
              country: from.name,
            })}
            {feesIncluded
              ? t("transfer.feesIncludedSuffix")
              : t("transfer.feesExtraSuffix", {
                  convert: formatMoney(convertAmount, from),
                  fee: formatMoney(fee, from),
                })}
          </li>
          <li>
            {t("transfer.recipientWillReceive", {
              name: recipientName,
              amount: effectiveAmountToPayOut,
              country: to.name,
              network: selectedNetwork?.name ?? "",
              phone: recipientPhone,
            })}
          </li>
          <li>
            {t("transfer.serviceFees", {
              fee: formatMoney(fee, from),
            })}
            {feesIncluded
              ? t("transfer.feesDeducted")
              : t("transfer.feesPaidExtra")}
          </li>
          <li>{t("transfer.rateGuaranteed")}</li>
          <li>{t("transfer.infoAccurate")}</li>
          <li>{t("transfer.irreversible")}</li>
        </ul>
      </div>

      <button
        className={`${styles.checkboxRow} ${accepted ? styles.on : ""}`}
        onClick={() => setAccepted(!accepted)}
        aria-pressed={accepted}
      >
        <span className={styles.box}>
          {accepted && <Check aria-hidden="true" />}
        </span>
        <span className={styles.cbText}>{t("transfer.acceptTerms")}</span>
      </button>
    </div>
  );
}

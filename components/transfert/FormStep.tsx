"use client";

import { useEffect } from "react";
import styles from "@/app/transfer/transfer.module.scss";
import { IDirection } from "@/types/country";
import { INetworkResponse } from "@/types/networks";
import { useT } from "@/lib/i18n";
import {
  detectNetworkFromPhone,
  supportsAutoNetworkDetection,
} from "@/lib/detect-network";

/** Letters (incl. accents), spaces, hyphens and apostrophes — works on paste + all keyboards. */
function lettersOnly(value: string) {
  return value.replace(/[^\p{L}\s'-]/gu, "");
}

/** Digits only — works on paste + mobile numeric keypad. */
function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export default function FormStep(props: {
  senderName: string;
  setSenderName: React.Dispatch<React.SetStateAction<string>>;
  recipientName: string;
  setRecipientName: React.Dispatch<React.SetStateAction<string>>;
  recipientPhone: string;
  setRecipientPhone: React.Dispatch<React.SetStateAction<string>>;
  payment: string;
  setPayment: React.Dispatch<React.SetStateAction<string>>;
  networks: INetworkResponse[];
  iltineraire: IDirection;
}) {
  const t = useT();
  const countryCode = props.iltineraire?.countryTo?.name;
  const lockedNetworks = supportsAutoNetworkDetection(countryCode);

  useEffect(() => {
    if (!lockedNetworks) return;

    const networkId = detectNetworkFromPhone(
      props.recipientPhone,
      countryCode,
      props.networks,
    );

    if (networkId) {
      if (networkId !== props.payment) props.setPayment(networkId);
      return;
    }

    // Prefix unknown / incomplete → clear locked selection
    if (props.payment) props.setPayment("");
  }, [
    lockedNetworks,
    props.recipientPhone,
    countryCode,
    props.networks,
    props.payment,
    props.setPayment,
  ]);

  return (
    <div>
      <h2 className={styles.stepTitle}>{t("transfer.detailsTitle")}</h2>
      <p className={styles.stepDesc}>{t("transfer.detailsDesc")}</p>

      <span className={styles.label}>{t("transfer.sender")}</span>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="text"
          inputMode="text"
          autoComplete="name"
          placeholder={t("transfer.fullNamePlaceholder")}
          value={props.senderName}
          onChange={(e) => props.setSenderName(lettersOnly(e.target.value))}
          aria-label={t("transfer.senderNameAria")}
        />
      </div>

      <span className={styles.label}>{t("transfer.recipient")}</span>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="text"
          inputMode="text"
          autoComplete="name"
          placeholder={t("transfer.fullNamePlaceholder")}
          value={props.recipientName}
          onChange={(e) => props.setRecipientName(lettersOnly(e.target.value))}
          aria-label={t("transfer.recipientNameAria")}
        />
      </div>

      <span className={styles.label}>{t("transfer.recipientPhone")}</span>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          pattern="[0-9]*"
          placeholder={`${props.iltineraire.countryTo.formatNumber}`}
          value={props.recipientPhone}
          onChange={(e) =>
            props.setRecipientPhone(digitsOnly(e.target.value))
          }
          maxLength={Number(props.iltineraire.countryTo.TelMaxNumber) || undefined}
          aria-label={t("transfer.recipientPhone")}
          aria-invalid={
            props.recipientPhone.length > 0 &&
            props.recipientPhone.length !==
              Number(props.iltineraire.countryTo.TelMaxNumber)
          }
        />
      </div>

      <span className={styles.label}>{t("transfer.paymentMethod")}</span>
      {lockedNetworks && (
        <p className={styles.networkAutoHint}>{t("transfer.networkAutoHint")}</p>
      )}
      <div
        className={`${styles.payGrid} ${lockedNetworks ? styles.payGridLocked : ""}`}
      >
        {props.networks &&
          props.networks.map((m) => {
            const selected = props.payment === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`${styles.payChip} ${selected ? styles.selected : ""} ${lockedNetworks ? styles.locked : ""}`}
                onClick={() => {
                  if (lockedNetworks) return;
                  props.setPayment(m.id);
                }}
                disabled={lockedNetworks}
                aria-disabled={lockedNetworks}
                title={
                  lockedNetworks ? t("transfer.networkAutoHint") : undefined
                }
              >
                <div className={styles.pLabel}>{m.name}</div>
                <div className={styles.pHint}>{m.pubicName}</div>
              </button>
            );
          })}
      </div>
    </div>
  );
}

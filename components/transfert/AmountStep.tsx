import { AFRICAN_COUNTRIES, Country, RUSSIA, formatMoney } from "@/lib/data";
import { TransferType } from "@/lib/storage";
import styles from "@/app/transfer/transfer.module.scss";
import { ArrowDown, Lock } from "lucide-react";
import { IClientResponse } from "@/types/user";
import { IDirection, IRate } from "@/types/country";

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
}) {
  const pickerLabel =
    type === "send" ? "Pays du destinataire" : "Pays de l'expéditeur";

  const fee = parseFloat(amount) * ((iltineraire?.fee || 0) / 100);

  return (
    <div>
      <h2 className={styles.stepTitle}>{pickerLabel}</h2>
      <p className={styles.stepDesc}>
        {type === "send"
          ? "Sélectionnez le pays qui recevra les fonds."
          : "Sélectionnez le pays d'où proviennent les fonds."}
      </p>

      <div className={styles.fixedSide}>
        <span className={styles.flag}>
          {type === "send" ? from.flag : to.flag}
        </span>
        <div>
          <div className={styles.fLabel}>
            {type === "send" ? "Expéditeur" : "Destinataire"}
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

      <div className={styles.amountBox}>
        <div className={styles.amountLabel}>
          <span>Vous envoyez ({from.name})</span>
        </div>
        <div className={styles.amountInput}>
          <input
            type="number"
            inputMode="decimal"
            placeholder={`minimun ${iltineraire?.min || 0}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Montant à envoyer"
          />
          <span className={styles.cur}>{from.currency}</span>
        </div>
      </div>

      <div className={styles.swapLine}>
        <span className={styles.swapIcon}>
          <ArrowDown aria-hidden="true" />
        </span>
      </div>

      <div className={`${styles.amountBox} ${styles.received}`}>
        <div className={styles.amountLabel}>
          <span>Le destinataire reçoit ({to.name})</span>
        </div>
        <div className={styles.amountInput}>
          <span className={styles.amountValue}>
            {amountNum > 0
              ? formatMoney(
                  parseFloat(amount) * parseFloat(rateData?.taux ?? "0"),
                  to,
                )
              : `0 ${to.symbol}`}
          </span>
        </div>
      </div>

      {amountNum > 0 && (
        <div className={styles.breakdown}>
          <div className={styles.brow}>
            <span>Montant</span>
            <strong>{formatMoney(amountNum, from)}</strong>
          </div>
          <div className={styles.brow}>
            <span>Frais ({iltineraire?.fee})%</span>
            <strong>{formatMoney(fee, from)}</strong>
          </div>
          <div className={styles.divider} />
          <div className={styles.brow}>
            <span>Total à payer</span>
            <strong>{formatMoney(amountNum + fee, from)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

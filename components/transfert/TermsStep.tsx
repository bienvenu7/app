import { Country, formatMoney, computeTransferAmounts } from "@/lib/data";
import { IDirection, IRate } from "@/types/country";
import styles from "@/app/transfer/transfer.module.scss";
import { Check } from "lucide-react";
import { INetworkResponse } from "@/types/networks";

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
}: {
  accepted: boolean;
  setAccepted: (v: boolean) => void;
  from: Country;
  to: Country;
  amountNum: number;
  quote: { fee: number; received: number };
  amount: string;
  rateData: IRate;
  iltineraire: IDirection;
  feesIncluded: boolean;
  recipientName: string;
  selectedNetwork: INetworkResponse;
  recipientPhone: string;
}) {
  const rate = parseFloat(rateData?.taux ?? "0");
  const { fee, totalToPay, convertAmount, amountToPayOut } =
    computeTransferAmounts(
      amountNum,
      iltineraire?.fee || 0,
      rate,
      feesIncluded,
    );
  return (
    <div>
      <h2 className={styles.stepTitle}>Conditions du transfert</h2>
      <p className={styles.stepDesc}>
        Veuillez lire et accepter avant de continuer.
      </p>

      <div className={styles.terms}>
        <h3>Contrat de transfert</h3>
        <ul>
          <li>
            Vous payez <strong>{formatMoney(totalToPay, from)}</strong> depuis{" "}
            {from.name}
            {feesIncluded
              ? " (frais inclus)."
              : ` (${formatMoney(convertAmount, from)} + ${formatMoney(fee, from)} de frais).`}
          </li>
          <li>
            Le destinataire <strong>{recipientName}</strong> recevra{" "}
            <strong>{formatMoney(amountToPayOut, to)}</strong> en {to.name} via{" "}
            <strong>{selectedNetwork?.name}</strong> au{" "}
            <strong>{recipientPhone}</strong>
          </li>
          <li>
            Des frais de service de <strong>{formatMoney(fee, from)}</strong>{" "}
            s&apos;appliquent
            {feesIncluded
              ? " et sont déduits du montant envoyé."
              : " et sont payés en supplément."}
          </li>
          <li>Le taux de change est garanti pendant 30 minutes.</li>
          <li>Les informations fournies sont exactes et vérifiables.</li>
          <li>Le transfert est irréversible une fois validé et payé.</li>
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
        <span className={styles.cbText}>
          J&apos;accepte les <span>conditions générales</span> et le contrat de
          transfert d&apos;AFRU-E.
        </span>
      </button>
    </div>
  );
}

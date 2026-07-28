import styles from "@/app/transfer/transfer.module.scss";
import { IDirection } from "@/types/country";
import { INetworkResponse } from "@/types/networks";

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
  return (
    <div>
      <h2 className={styles.stepTitle}>Détails du transfert</h2>
      <p className={styles.stepDesc}>
        Renseignez l&apos;expéditeur et le destinataire.
      </p>

      <span className={styles.label}>Expéditeur</span>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="text"
          inputMode="text"
          autoComplete="name"
          placeholder="Nom(s) et Prénom(s)"
          value={props.senderName}
          onChange={(e) => props.setSenderName(lettersOnly(e.target.value))}
          aria-label="Prénom de l'expéditeur"
        />
      </div>

      <span className={styles.label}>Destinataire</span>
      <div className={styles.field}>
        <input
          className={styles.input}
          type="text"
          inputMode="text"
          autoComplete="name"
          placeholder="Nom(s) et Prénom(s)"
          value={props.recipientName}
          onChange={(e) => props.setRecipientName(lettersOnly(e.target.value))}
          aria-label="Prénom du destinataire"
        />
      </div>

      <span className={styles.label}>Téléphone du destinataire</span>
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
          aria-label="Téléphone du destinataire"
          aria-invalid={
            props.recipientPhone.length > 0 &&
            props.recipientPhone.length !==
              Number(props.iltineraire.countryTo.TelMaxNumber)
          }
        />
      </div>

      <span className={styles.label}>Moyen de paiement du destinataire</span>
      <div className={styles.payGrid}>
        {props.networks &&
          props.networks.map((m) => (
            <button
              key={m.id}
              className={`${styles.payChip} ${props.payment === m.id ? styles.selected : ""}`}
              onClick={() => props.setPayment(m.id)}
            >
              <div className={styles.pLabel}>{m.name}</div>
              <div className={styles.pHint}>{m.pubicName}</div>
            </button>
          ))}
      </div>
    </div>
  );
}

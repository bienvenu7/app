import styles from "@/app/transfer/transfer.module.scss";
import { TransferType } from "@/lib/storage";
import { ArrowDownLeft, ArrowUpRight, Check } from "lucide-react";

export default function TypeStep({
  type,
  setType,
}: {
  type: TransferType;
  setType: (t: TransferType) => void;
}) {
  const options: {
    id: TransferType;
    label: string;
    desc: string;
    icon: typeof ArrowUpRight;
  }[] = [
    {
      id: "send",
      label: "Envoyer de l'argent",
      desc: "De la Russie vers l'Afrique",
      icon: ArrowUpRight,
    },
    {
      id: "receive",
      label: "Recevoir de l'argent",
      desc: "De l'Afrique vers la Russie",
      icon: ArrowDownLeft,
    },
  ];
  return (
    <div>
      <h2 className={styles.stepTitle}>Que souhaitez-vous faire ?</h2>
      <p className={styles.stepDesc}>Choisissez le type d&apos;opération.</p>
      <div className={styles.typeGrid}>
        {options.map((o) => {
          const Icon = o.icon;
          const selected = type === o.id;
          return (
            <button
              key={o.id}
              className={`${styles.typeCard} ${selected ? styles.selected : ""}`}
              onClick={() => setType(o.id)}
            >
              <span className={styles.tIcon}>
                <Icon aria-hidden="true" />
              </span>
              <span>
                <span className={styles.tLabel}>{o.label}</span>
                <span className={styles.tDesc}>{o.desc}</span>
              </span>
              <span className={styles.check}>
                {selected && <Check aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import styles from "@/app/transfer/transfer.module.scss";
import { TransferType } from "@/lib/storage";
import { ArrowDownLeft, ArrowUpRight, Check } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function TypeStep({
  type,
  setType,
  userCountryName,
}: {
  type: TransferType;
  setType: (t: TransferType) => void;
  userCountryName: string;
}) {
  const t = useT();
  const country = userCountryName.trim() || t("transfer.yourCountry");

  const options: {
    id: TransferType;
    label: string;
    desc: string;
    icon: typeof ArrowUpRight;
  }[] = [
    {
      id: "send",
      label: t("transfer.sendMoney"),
      desc: t("transfer.sendFrom", { country }),
      icon: ArrowUpRight,
    },
    {
      id: "receive",
      label: t("transfer.receiveMoney"),
      desc: t("transfer.receiveTo", { country }),
      icon: ArrowDownLeft,
    },
  ];

  return (
    <div>
      <h2 className={styles.stepTitle}>{t("transfer.typeTitle")}</h2>
      <p className={styles.stepDesc}>{t("transfer.typeDesc")}</p>
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

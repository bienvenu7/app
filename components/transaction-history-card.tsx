import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatMoney, getCountry } from "@/lib/data";
import {
  formatTransactionStatus,
  isWaitingStatus,
} from "@/lib/transaction-utils";
import type { ITrasanctionResponse } from "@/types/transaction";
import { Status } from "@/types/transaction";
import styles from "./transaction-history-card.module.scss";

function parseRoute(code?: string) {
  const [fromCode, toCode] = (code ?? "").split("-");
  return {
    from: getCountry(fromCode),
    to: getCountry(toCode),
  };
}

function getStatusClass(status: Status | string) {
  if (status === Status.WAITING || status === "WAITING") return styles.waiting;
  if (status === Status.INPROGRESS || status === "INPROGRESS") {
    return styles.inprogress;
  }
  if (
    status === Status.CONFIRMED ||
    status === Status.FINISH ||
    status === "CONFIRMED" ||
    status === "FINISH"
  ) {
    return styles.done;
  }
  if (status === Status.ERROR || status === "ERROR") return styles.error;
  return styles.waiting;
}

export function TransactionHistoryCard({
  tx,
  onSelect,
}: {
  tx: ITrasanctionResponse;
  onSelect?: (tx: ITrasanctionResponse) => void;
}) {
  const isSend = tx.type === "SEND";
  const { from, to } = parseRoute(tx.code);

  const counterpart = isSend ? tx.receiverName : tx.senderName;
  const prefix = isSend ? "Vers" : "De";

  const primaryCountry = isSend ? from : to;
  const secondaryCountry = isSend ? to : from;
  const primaryAmount = isSend ? tx.amountToSend : tx.amountToPayOut;
  const secondaryAmount = isSend ? tx.amountToPayOut : tx.amountToSend;

  const time =
    tx.hour ||
    new Date(tx.createdAt).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const isPending = isWaitingStatus(tx.status);
  const statusLabel = formatTransactionStatus(tx.status);
  const statusClass = getStatusClass(tx.status);

  const content = (
    <>
      <span
        className={`${styles.icon} ${isSend ? styles.send : styles.receive}`}
        aria-hidden="true"
      >
        {isSend ? <ArrowUpRight /> : <ArrowDownLeft />}
      </span>

      <div className={styles.main}>
        <div className={styles.direction}>
          <span className={styles.prefix}>{prefix} · </span>
          {counterpart}
        </div>
        <div className={styles.meta}>
          <span className={styles.txid}>{tx.txid}</span>
          <span className={styles.sep}>·</span>
          <span>{time}</span>
          <span className={styles.sep}>·</span>
          <span className={`${styles.status} ${statusClass}`}>{statusLabel}</span>
        </div>
        <div className={styles.flags} aria-hidden="true">
          <span>{from?.flag ?? "🌍"}</span>
          <span className={styles.arrow}>→</span>
          <span>{to?.flag ?? "🌍"}</span>
        </div>
      </div>

      <div className={styles.amounts}>
        <div
          className={`${styles.amount} ${isSend ? styles.minus : styles.plus}`}
        >
          {isSend ? "−" : "+"}
          {primaryCountry
            ? formatMoney(primaryAmount, primaryCountry)
            : primaryAmount}
        </div>
        <div className={styles.conversion}>
          {isSend ? "→" : "←"}{" "}
          {secondaryCountry
            ? formatMoney(secondaryAmount, secondaryCountry)
            : secondaryAmount}
        </div>
      </div>
    </>
  );

  if (isPending) {
    return (
      <Link
        href={`/transfer/validate?id=${encodeURIComponent(tx.id ?? tx.txid)}`}
        className={`${styles.card} ${styles.clickable}`}
        aria-label={`Confirmer le transfert ${tx.txid}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.card} ${styles.clickable}`}
      onClick={() => onSelect?.(tx)}
      aria-label={`Voir les détails du transfert ${tx.txid}`}
    >
      {content}
    </button>
  );
}

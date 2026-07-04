import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { getCountry, formatMoney } from "@/lib/data"
import type { Transaction } from "@/lib/storage"
import styles from "./transaction-row.module.scss"

export function TransactionRow({ tx }: { tx: Transaction }) {
  const isSend = tx.type === "send"
  const from = getCountry(tx.fromCode)
  const to = getCountry(tx.toCode)
  // For a "send": counterpart is the recipient. For "receive": counterpart is sender.
  const counterpartName = isSend
    ? `${tx.recipientFirstName} ${tx.recipientLastName}`
    : `${tx.senderFirstName} ${tx.senderLastName}`

  const time = new Date(tx.createdAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className={styles.row}>
      <span className={`${styles.icon} ${isSend ? styles.send : styles.receive}`}>
        {isSend ? (
          <ArrowUpRight aria-hidden="true" />
        ) : (
          <ArrowDownLeft aria-hidden="true" />
        )}
      </span>

      <div className={styles.main}>
        <div className={styles.name}>{counterpartName}</div>
        <div className={styles.meta}>
          <span className={styles.txid}>{tx.txid}</span>
          <span className={styles.sep}>·</span>
          <span>{time}</span>
        </div>
      </div>

      <div className={styles.amounts}>
        <div className={`${styles.amount} ${isSend ? "" : styles.plus}`}>
          {isSend
            ? `- ${from ? formatMoney(tx.amountSource, from) : ""}`
            : `+ ${to ? formatMoney(tx.received, to) : ""}`}
        </div>
        <div className={styles.route}>
          {from?.flag} {from?.code} → {to?.flag} {to?.code}
        </div>
      </div>
    </div>
  )
}

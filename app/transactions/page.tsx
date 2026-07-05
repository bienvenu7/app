"use client";

import { useMemo } from "react";
import moment from "moment";
import "moment/locale/fr";
import { Inbox } from "lucide-react";
import styles from "./transactions.module.scss";
import Loading from "@/components/Loading";
import { TransactionHistoryCard } from "@/components/transaction-history-card";
import { Auth } from "@/providers/AuthContext";
import { useGetTransactonByEmail } from "@/hooks/useTransaction";
import { actualDate } from "@/utils/moment";
import type { ITrasanctionResponse } from "@/types/transaction";

moment.locale("fr");

function formatGroupDate(tx: ITrasanctionResponse) {
  const raw = tx.createdAt ?? tx.dateTime;
  const parsed = moment(raw, ["DD-MM-YYYY", moment.ISO_8601], true);
  const date = parsed.isValid() ? parsed : moment(raw);
  return date.format("D MMMM YYYY").toUpperCase();
}

function sortKey(tx: ITrasanctionResponse) {
  const raw = tx.createdAt ?? tx.dateTime;
  const parsed = moment(raw, ["DD-MM-YYYY", moment.ISO_8601], true);
  return parsed.isValid() ? parsed.valueOf() : moment(raw).valueOf();
}

export default function TransactionsPage() {
  const {
    state: { user, isLoading },
  } = Auth();

  const { transactions, isGettingTransaction } = useGetTransactonByEmail(
    user?.email,
    actualDate,
  );

  const grouped = useMemo(() => {
    const list = [...((transactions as ITrasanctionResponse[]) ?? [])].sort(
      (a, b) => sortKey(b) - sortKey(a),
    );

    const map = new Map<string, ITrasanctionResponse[]>();
    for (const tx of list) {
      const label = formatGroupDate(tx);
      const group = map.get(label) ?? [];
      group.push(tx);
      map.set(label, group);
    }
    return Array.from(map.entries());
  }, [transactions]);

  const total = (transactions as ITrasanctionResponse[])?.length ?? 0;
  const totalLabel =
    total <= 1 ? "1 transaction au total" : `${total} transactions au total`;

  if (isLoading) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <Loading />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Mes <em>transactions</em>
        </h1>
        <p className={styles.subtitle}>{totalLabel}</p>
      </header>

      {isGettingTransaction ? (
        <div className={styles.loadingWrap}>
          <Loading />
        </div>
      ) : total === 0 ? (
        <div className={styles.empty}>
          <Inbox aria-hidden="true" />
          <div>Aucune transaction pour l&apos;instant.</div>
        </div>
      ) : (
        grouped.map(([date, items]) => (
          <section key={date} className={styles.dateGroup}>
            <h2 className={styles.dateLabel}>{date}</h2>
            <div className={styles.list}>
              {items.map((tx) => (
                <TransactionHistoryCard key={tx.id ?? tx.txid} tx={tx} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";
import "moment/locale/fr";
import { Inbox } from "lucide-react";
import styles from "./transactions.module.scss";
import Loading from "@/components/Loading";
import { TransactionHistoryCard } from "@/components/transaction-history-card";
import { TransactionDetailsModal } from "@/components/transaction-details-modal";
import { Auth } from "@/providers/AuthContext";
import { useInfiniteTransactionsByEmail } from "@/hooks/useTransaction";
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

function txKey(tx: ITrasanctionResponse) {
  return tx.id ?? tx.txid;
}

export default function TransactionsPage() {
  const {
    state: { user, isLoading },
  } = Auth();

  const {
    data,
    isGettingTransaction,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTransactionsByEmail(user?.email);

  const [selectedTx, setSelectedTx] = useState<ITrasanctionResponse | null>(
    null,
  );

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const seen = new Set<string>();
    const list: ITrasanctionResponse[] = [];

    for (const page of data?.pages ?? []) {
      for (const day of page.days) {
        for (const tx of day.transactions) {
          const key = txKey(tx);
          if (seen.has(key)) continue;
          seen.add(key);
          list.push(tx);
        }
      }
    }

    list.sort((a, b) => sortKey(b) - sortKey(a));

    const map = new Map<string, ITrasanctionResponse[]>();
    for (const tx of list) {
      const label = formatGroupDate(tx);
      const group = map.get(label) ?? [];
      group.push(tx);
      map.set(label, group);
    }

    return Array.from(map.entries());
  }, [data]);

  const total = useMemo(() => {
    const seen = new Set<string>();
    for (const page of data?.pages ?? []) {
      for (const day of page.days) {
        for (const tx of day.transactions) {
          seen.add(txKey(tx));
        }
      }
    }
    return seen.size;
  }, [data]);

  const totalLabel =
    total <= 1 ? "1 transaction au total" : `${total} transactions au total`;

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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
        <>
          {grouped.map(([date, items]) => (
            <section key={date} className={styles.dateGroup}>
              <h2 className={styles.dateLabel}>{date}</h2>
              <div className={styles.list}>
                {items.map((tx) => (
                  <TransactionHistoryCard
                    key={txKey(tx)}
                    tx={tx}
                    onSelect={setSelectedTx}
                  />
                ))}
              </div>
            </section>
          ))}

          {isFetchingNextPage && (
            <div className={styles.loadMore} aria-live="polite">
              <Loading />
            </div>
          )}

          {hasNextPage && (
            <div
              ref={loadMoreRef}
              className={styles.sentinel}
              aria-hidden="true"
            />
          )}
        </>
      )}

      {selectedTx && (
        <TransactionDetailsModal
          tx={selectedTx}
          open={!!selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import styles from "./transactions.module.scss";
import Loading from "@/components/Loading";
import { TransactionHistoryCard } from "@/components/transaction-history-card";
import { TransactionDetailsModal } from "@/components/transaction-details-modal";
import { Auth } from "@/providers/AuthContext";
import { useProgressiveTransactionsByEmail } from "@/hooks/useProgressiveTransactions";
import type { ITrasanctionResponse } from "@/types/transaction";

function txKey(tx: ITrasanctionResponse) {
  return tx.id ?? tx.txid;
}

export default function TransactionsPage() {
  const {
    state: { user, isLoading },
  } = Auth();

  const {
    days,
    total,
    hasMore,
    isInitialLoading,
    isLoadingMore,
    fetchNextPage,
  } = useProgressiveTransactionsByEmail(user?.email);

  const [selectedTx, setSelectedTx] = useState<ITrasanctionResponse | null>(
    null,
  );

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const totalLabel =
    total <= 1 ? "1 transaction au total" : `${total} transactions au total`;

  const showInitialLoader = isInitialLoading && total === 0;
  const showEmpty = !isInitialLoading && total === 0;
  const isFetching = isInitialLoading || isLoadingMore;

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, isFetching]);

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

      {showInitialLoader ? (
        <div className={styles.loadingWrap}>
          <Loading />
        </div>
      ) : showEmpty ? (
        <div className={styles.empty}>
          <Inbox aria-hidden="true" />
          <div>Aucune transaction pour l&apos;instant.</div>
        </div>
      ) : (
        <>
          {days.map((day) => (
            <section key={day.dateKey} className={styles.dateGroup}>
              <h2 className={styles.dateLabel}>{day.label}</h2>
              <div className={styles.list}>
                {day.transactions.map((tx) => (
                  <TransactionHistoryCard
                    key={txKey(tx)}
                    tx={tx}
                    onSelect={setSelectedTx}
                  />
                ))}
              </div>
            </section>
          ))}

          {isFetching && (
            <div className={styles.loadMore} aria-live="polite">
              <Loading />
            </div>
          )}

          {hasMore && !isFetching && (
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

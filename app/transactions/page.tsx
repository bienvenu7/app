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

function txKey(tx: ITrasanctionResponse) {
  return String(tx.id ?? tx.txid ?? "");
}

function txMoment(tx: ITrasanctionResponse) {
  const raw = tx.createdAt ?? tx.dateTime;
  const parsed = moment(raw, ["DD-MM-YYYY", moment.ISO_8601], true);
  return parsed.isValid() ? parsed : moment(raw);
}

function dedupeTransactions(transactions: ITrasanctionResponse[]) {
  const seen = new Set<string>();
  return transactions.filter((tx) => {
    const key = txKey(tx);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupByDay(transactions: ITrasanctionResponse[]) {
  const map = new Map<string, ITrasanctionResponse[]>();

  for (const tx of transactions) {
    const m = txMoment(tx);
    const dateKey = m.isValid() ? m.format("DD-MM-YYYY") : "unknown";
    const list = map.get(dateKey) ?? [];
    list.push(tx);
    map.set(dateKey, list);
  }

  return Array.from(map.entries())
    .map(([dateKey, txs]) => ({
      dateKey,
      label:
        dateKey === "unknown"
          ? "DATE INCONNUE"
          : moment(dateKey, "DD-MM-YYYY").format("D MMMM YYYY").toUpperCase(),
      transactions: [...txs].sort(
        (a, b) => txMoment(b).valueOf() - txMoment(a).valueOf(),
      ),
    }))
    .sort((a, b) => {
      if (a.dateKey === "unknown") return 1;
      if (b.dateKey === "unknown") return -1;
      return (
        moment(b.dateKey, "DD-MM-YYYY").valueOf() -
        moment(a.dateKey, "DD-MM-YYYY").valueOf()
      );
    });
}

export default function TransactionsPage() {
  const {
    state: { user, isLoading },
  } = Auth();

  const {
    data,
    isGettingTransaction,
    isTransactionError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTransactionsByEmail(user?.email);

  const [selectedTx, setSelectedTx] = useState<ITrasanctionResponse | null>(
    null,
  );

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const transactions = useMemo(() => {
    const pages = data?.pages ?? [];
    const collected: ITrasanctionResponse[] = [];

    for (const page of pages) {
      const list = Array.isArray(page?.transactions)
        ? page.transactions
        : Array.isArray(page)
          ? page
          : [];
      collected.push(...list);
    }

    return dedupeTransactions(collected);
  }, [data]);

  const days = useMemo(() => groupByDay(transactions), [transactions]);
  const total = transactions.length;

  const totalLabel =
    total === 0
      ? "Aucune transaction"
      : total === 1
        ? "1 transaction au total"
        : `${total} transactions au total`;

  const isFetching = isGettingTransaction || isFetchingNextPage;
  const hasMore = !!hasNextPage;
  const lastPageTxCount = data?.pages.at(-1)?.transactions?.length ?? 0;
  const lastPageEmpty = !!data?.pages.length && lastPageTxCount === 0;

  // Keep searching older periods when the latest window was empty
  useEffect(() => {
    if (!hasMore || isFetching || !lastPageEmpty) return;
    void fetchNextPage();
  }, [fetchNextPage, hasMore, isFetching, lastPageEmpty]);

  // Full-page loader only before the first transaction appears
  const showInitialLoader =
    isLoading ||
    (total === 0 && (isFetching || hasMore) && !isTransactionError);
  const showEmpty =
    total === 0 && !showInitialLoader && !isFetching && !hasMore;

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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Mes <em>transactions</em>
        </h1>
        <p className={styles.subtitle}>
          {showInitialLoader ? "Chargement..." : totalLabel}
        </p>
      </header>

      {showInitialLoader ? (
        <div className={styles.loadingWrap}>
          <Loading />
        </div>
      ) : showEmpty ? (
        <div className={styles.empty}>
          <Inbox aria-hidden="true" />
          <div>
            {isTransactionError
              ? "Impossible de charger vos transactions."
              : "Aucune transaction pour l&apos;instant."}
          </div>
        </div>
      ) : (
        <>
          {days.map((day) => (
            <section key={day.dateKey} className={styles.dateGroup}>
              <h2 className={styles.dateLabel}>{day.label}</h2>
              <div className={styles.list}>
                {day.transactions.map((tx, index) => (
                  <TransactionHistoryCard
                    key={`${day.dateKey}-${txKey(tx) || "tx"}-${index}`}
                    tx={tx}
                    onSelect={setSelectedTx}
                  />
                ))}
              </div>
            </section>
          ))}

          {(isFetching || hasMore) && (
            <div className={styles.loadMore} aria-live="polite">
              {isFetching ? (
                <Loading />
              ) : (
                <div
                  ref={loadMoreRef}
                  className={styles.sentinel}
                  aria-hidden="true"
                />
              )}
            </div>
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

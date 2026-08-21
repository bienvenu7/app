"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import moment from "moment";
import "moment/locale/fr";
import "moment/locale/ru";
import { getTransactionByClientEmail } from "@/app/actions/transaction";
import { unwrapAction } from "@/lib/auth-errors";
import type { ITrasanctionResponse } from "@/types/transaction";

// Locale is applied dynamically via LocaleProvider
moment.locale("fr");

const ACTIVE_DAYS_PER_PAGE = 3;
const TRANSACTION_HISTORY_MONTHS = 6;

export type TransactionDayGroup = {
  dateKey: string;
  label: string;
  transactions: ITrasanctionResponse[];
};

function getMinDate() {
  return moment()
    .subtract(TRANSACTION_HISTORY_MONTHS, "months")
    .startOf("day");
}

function formatDayLabel(dateKey: string) {
  return moment(dateKey, "DD-MM-YYYY").format("D MMMM YYYY").toUpperCase();
}

function sortTransactions(txs: ITrasanctionResponse[]) {
  return [...txs].sort((a, b) => {
    const rawA = a.createdAt ?? a.dateTime;
    const rawB = b.createdAt ?? b.dateTime;
    const parsedA = moment(rawA, ["DD-MM-YYYY", moment.ISO_8601], true);
    const parsedB = moment(rawB, ["DD-MM-YYYY", moment.ISO_8601], true);
    const keyA = parsedA.isValid()
      ? parsedA.valueOf()
      : moment(rawA).valueOf();
    const keyB = parsedB.isValid()
      ? parsedB.valueOf()
      : moment(rawB).valueOf();
    return keyB - keyA;
  });
}

function insertDay(prev: TransactionDayGroup[], day: TransactionDayGroup) {
  if (prev.some((d) => d.dateKey === day.dateKey)) return prev;
  const next = [...prev, day];
  next.sort(
    (a, b) =>
      moment(b.dateKey, "DD-MM-YYYY").valueOf() -
      moment(a.dateKey, "DD-MM-YYYY").valueOf(),
  );
  return next;
}

export function useProgressiveTransactionsByEmail(email: string | undefined) {
  const [days, setDays] = useState<TransactionDayGroup[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const cursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);
  const emailRef = useRef(email);
  emailRef.current = email;

  const loadBatch = useCallback(
    async (startFrom: string | undefined, append: boolean) => {
      const currentEmail = emailRef.current;
      if (!currentEmail || loadingRef.current) return;

      loadingRef.current = true;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsInitialLoading(true);
        setDays([]);
        setHasMore(true);
        cursorRef.current = undefined;
      }

      const minDate = getMinDate();
      let current = startFrom
        ? moment(startFrom, "DD-MM-YYYY", true)
        : moment();

      if (!current.isValid()) {
        current = moment();
      }

      if (current.isBefore(minDate, "day")) {
        setHasMore(false);
        loadingRef.current = false;
        setIsInitialLoading(false);
        setIsLoadingMore(false);
        return;
      }

      let foundActiveDays = 0;

      try {
        while (
          foundActiveDays < ACTIVE_DAYS_PER_PAGE &&
          current.isSameOrAfter(minDate, "day")
        ) {
          const dateStr = current.format("DD-MM-YYYY");
          const transactions = await unwrapAction(
            getTransactionByClientEmail(currentEmail, dateStr),
          );

          if (transactions.length > 0) {
            foundActiveDays++;
            const day: TransactionDayGroup = {
              dateKey: dateStr,
              label: formatDayLabel(dateStr),
              transactions: sortTransactions(transactions),
            };
            setDays((prev) => insertDay(prev, day));
          }

          current = current.subtract(1, "day");
        }

        cursorRef.current = current.format("DD-MM-YYYY");
        setHasMore(
          foundActiveDays >= ACTIVE_DAYS_PER_PAGE &&
            current.isSameOrAfter(minDate, "day"),
        );
      } finally {
        loadingRef.current = false;
        setIsInitialLoading(false);
        setIsLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!email) {
      setDays([]);
      setHasMore(false);
      return;
    }

    loadBatch(undefined, false);
  }, [email, loadBatch]);

  const fetchNextPage = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadBatch(cursorRef.current, true);
  }, [hasMore, loadBatch]);

  const total = days.reduce((sum, day) => sum + day.transactions.length, 0);

  return {
    days,
    total,
    hasMore,
    isInitialLoading,
    isLoadingMore,
    fetchNextPage,
  };
}

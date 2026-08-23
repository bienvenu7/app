"use server";

import { instance } from "@/config/instance";
import moment from "moment";
import type {
  ITrasanctionData,
  ITrasanctionResponse,
  Status,
} from "../../types/transaction";
import { AuthHttpError, withAuthError } from "@/lib/auth-errors";
import { loadPublicCountries } from "@/app/actions/country";
import {
  requireAccessToken,
  requireAuthEmail,
  requireAuthUser,
} from "@/lib/require-auth";
import {
  isOutsideWorkingSchedule,
  resolveTransferSchedule,
  timeZoneForCountryCode,
} from "@/lib/working-hours";

const TRANSACTION_HISTORY_MONTHS = 6;
const MONTHS_PER_PAGE = 3;

function getTransactionHistoryMinDate() {
  return moment().subtract(TRANSACTION_HISTORY_MONTHS, "months").startOf("day");
}

type TransactionDayBatch = {
  days: {
    dateKey: string;
    transactions: ITrasanctionResponse[];
  }[];
  nextCursor: string;
  hasMore: boolean;
};

type TransactionPeriodBatch = {
  transactions: ITrasanctionResponse[];
  startDate: string;
  endDate: string;
  nextCursor: string;
  hasMore: boolean;
};

interface ITransactionStatsMonthlyResponse {
  transactions: ITrasanctionResponse[];
  total: number;
  send: number;
  receive: number;
}

function normalizeTransactionList(data: unknown): ITrasanctionResponse[] {
  return Array.isArray(data) ? (data as ITrasanctionResponse[]) : [];
}

async function loadTransactionsByPeriod(
  startDate: string,
  endDate: string,
): Promise<ITrasanctionResponse[]> {
  const { data } = await instance.get(
    `transactions/client/transactions?startDate=${startDate}&endDate=${endDate}`,
  );
  return normalizeTransactionList(data);
}

async function loadTransactionsByClientEmail(
  clientEmail: string,
  date: string,
): Promise<ITrasanctionResponse[]> {
  const pathEmail = encodeURIComponent(clientEmail || "_");
  const { data } = await instance.get(
    `transaction/get/by-client/${pathEmail}/${date}`,
  );
  return normalizeTransactionList(data);
}

export const createTransaction = async (
  transaction: ITrasanctionData,
): Promise<ITrasanctionResponse> => {
  return withAuthError(async () => {
    const user = await requireAuthUser();
    const countries = await loadPublicCountries();
    const destination = transaction.code?.split("-")[1];
    const shedule = resolveTransferSchedule(
      countries,
      transaction.origin,
      destination,
      user.Country,
    );
    const timeZone =
      timeZoneForCountryCode(transaction.origin) ??
      timeZoneForCountryCode(destination) ??
      timeZoneForCountryCode(user.Country?.name);

    if (isOutsideWorkingSchedule(shedule, timeZone)) {
      throw new AuthHttpError(403, "forbidden", "outside_working_schedule");
    }

    const { data } = await instance.post("transactions/create-one", {
      ...transaction,
      clientEmail: user.email,
    });
    return data;
  }) as Promise<ITrasanctionResponse>;
};

export const updateTransaction = async (
  transactionId: string,
  senderNumber: string,
  hour: string,
  status: Status,
): Promise<ITrasanctionResponse> => {
  return withAuthError(async () => {
    await requireAccessToken();
    const { data } = await instance.patch(`transactions/${transactionId}`, {
      senderNumber,
      hour,
      status,
    });
    return data;
  }) as Promise<ITrasanctionResponse>;
};

export const getTransactionById = async (
  transactionId: string,
): Promise<ITrasanctionResponse> => {
  return withAuthError(async () => {
    await requireAccessToken();
    const { data } = await instance.get(
      `transaction/get/by-id/${transactionId}`,
    );
    if (!data?.id) {
      throw new AuthHttpError(404, "not_found");
    }
    return data;
  }) as Promise<ITrasanctionResponse>;
};

export const getTransactionByClientEmail = async (
  _clientEmail: string,
  date: string,
): Promise<ITrasanctionResponse[]> => {
  return withAuthError(async () => {
    const email = await requireAuthEmail();
    return loadTransactionsByClientEmail(email, date);
  }) as Promise<ITrasanctionResponse[]>;
};

export const getTransactionByPeriod = async (
  startDate: string,
  endDate: string,
): Promise<ITrasanctionResponse[]> => {
  return withAuthError(async () => {
    await requireAccessToken();
    return loadTransactionsByPeriod(startDate, endDate);
  }) as Promise<ITrasanctionResponse[]>;
};

export const fetchTransactionsByThreeMonths = async (
  endDateCursor: string | undefined,
): Promise<TransactionPeriodBatch> => {
  return withAuthError(async () => {
    await requireAccessToken();
    const minDate = getTransactionHistoryMinDate();

    let end = endDateCursor
      ? moment(endDateCursor, "DD-MM-YYYY", true).startOf("day")
      : moment().startOf("day");

    if (!end.isValid()) {
      end = moment().startOf("day");
    }

    if (end.isBefore(minDate, "day")) {
      const empty = end.format("DD-MM-YYYY");
      return {
        transactions: [],
        startDate: empty,
        endDate: empty,
        nextCursor: empty,
        hasMore: false,
      };
    }

    let start = end.clone().subtract(MONTHS_PER_PAGE, "months").startOf("day");
    if (start.isBefore(minDate, "day")) {
      start = minDate.clone();
    }

    const startDate = start.format("DD-MM-YYYY");
    const endDate = end.format("DD-MM-YYYY");
    const transactions = await loadTransactionsByPeriod(startDate, endDate);

    const next = start.clone().subtract(1, "day").startOf("day");

    return {
      transactions,
      startDate,
      endDate,
      nextCursor: next.format("DD-MM-YYYY"),
      hasMore: next.isSameOrAfter(minDate, "day"),
    };
  }) as Promise<TransactionPeriodBatch>;
};

export const fetchTransactionsForActiveDays = async (
  _clientEmail: string,
  startFromDate: string | undefined,
  activeDaysCount: number,
): Promise<TransactionDayBatch> => {
  return withAuthError(async () => {
    const clientEmail = await requireAuthEmail();
    const minDate = getTransactionHistoryMinDate();

    let current = startFromDate
      ? moment(startFromDate, "DD-MM-YYYY", true)
      : moment().utc();

    if (!current.isValid()) {
      current = moment().utc();
    }

    if (current.isBefore(minDate, "day")) {
      return {
        days: [],
        nextCursor: current.format("DD-MM-YYYY"),
        hasMore: false,
      };
    }

    const days: TransactionDayBatch["days"] = [];

    while (
      days.length < activeDaysCount &&
      current.isSameOrAfter(minDate, "day")
    ) {
      const dateStr = current.format("DD-MM-YYYY");
      const transactions = await loadTransactionsByClientEmail(
        clientEmail,
        dateStr,
      );

      if (transactions.length > 0) {
        days.push({ dateKey: dateStr, transactions });
      }

      current = current.subtract(1, "day");
    }

    return {
      days,
      nextCursor: current.format("DD-MM-YYYY"),
      hasMore:
        days.length >= activeDaysCount && current.isSameOrAfter(minDate, "day"),
    };
  }) as Promise<TransactionDayBatch>;
};

export const getTransactionsStatsMonthly =
  async (): Promise<ITransactionStatsMonthlyResponse> => {
    return withAuthError(async () => {
      await requireAccessToken();
      const startDate = moment().startOf("month").format("DD-MM-YYYY");
      const endDate = moment().startOf("day").format("DD-MM-YYYY");
      const transactions = await loadTransactionsByPeriod(startDate, endDate);

      let send = 0;
      let receive = 0;
      for (const tx of transactions) {
        const type = String(tx.type ?? "").toUpperCase();
        if (type === "SEND") send += 1;
        else if (type === "RECEIVE") receive += 1;
      }

      return {
        transactions,
        total: transactions.length,
        send,
        receive,
      };
    }) as Promise<ITransactionStatsMonthlyResponse>;
  };

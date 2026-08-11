import { instance, instanceV2 } from "@/config/instance";
import type { ICard } from "@/types/networks";
import { getCookie } from "@/config/cookies";
import moment from "moment";
import type {
  ITrasanctionData,
  ITrasanctionResponse,
  Status,
} from "../../types/transaction";
import { toAuthHttpError } from "@/lib/auth-errors";

const TRANSACTION_HISTORY_MONTHS = 6;
const MONTHS_PER_PAGE = 3;

function getTransactionHistoryMinDate() {
  return moment().subtract(TRANSACTION_HISTORY_MONTHS, "months").startOf("day");
}

export type TransactionDayBatch = {
  days: {
    dateKey: string;
    transactions: ITrasanctionResponse[];
  }[];
  nextCursor: string;
  hasMore: boolean;
};

export type TransactionPeriodBatch = {
  transactions: ITrasanctionResponse[];
  startDate: string;
  endDate: string;
  nextCursor: string;
  hasMore: boolean;
};

export interface ITransactionStatsMonthlyResponse {
  transactions: ITrasanctionResponse[];
  total: number;
  send: number;
  receive: number;
}

export const createTransaction = async (
  transaction: ITrasanctionData,
): Promise<ITrasanctionResponse> => {
  const accessToken = getCookie("accessToken");
  // clientEmail reste requis par la validation Zod ; l'API force ensuite l'email du JWT.
  const { data } = await instanceV2.post(
    "transactions/create-one",
    transaction,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  return data;
};

export const updateTransaction = async (
  transactionId: string,
  senderNumber: string,
  hour: string,
  status: Status,
): Promise<ITrasanctionResponse> => {
  const accessToken = getCookie("accessToken");
  try {
    const { data } = await instanceV2.patch(
      `transactions/${transactionId}`,
      { senderNumber, hour, status },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

export const getTransactionById = async (
  transactionId: string,
): Promise<ITrasanctionResponse> => {
  const accessToken = getCookie("accessToken");

  try {
    const { data } = await instance.get(
      `transaction/get/by-id/${transactionId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

/**
 * Liste des transactions du jour pour le client JWT.
 * Le segment `clientEmail` du path est ignoré par l'API (scope = JWT).
 * On le conserve dans l'URL uniquement pour compatibilité de route.
 */
export const getTransactionByClientEmail = async (
  clientEmail: string,
  date: string,
): Promise<ITrasanctionResponse[]> => {
  const accessToken = getCookie("accessToken");
  const pathEmail = encodeURIComponent(clientEmail || "_");

  const { data } = await instance.get(
    `transaction/get/by-client/${pathEmail}/${date}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return data;
};

function normalizeTransactionList(data: unknown): ITrasanctionResponse[] {
  if (Array.isArray(data)) {
    return data as ITrasanctionResponse[];
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const obj = data as Record<string, unknown>;

  for (const key of [
    "transaction",
    "transactions",
    "data",
    "items",
    "results",
    "content",
  ]) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value as ITrasanctionResponse[];
    }
    // nested: { data: { transaction: [...] } }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of [
        "transaction",
        "transactions",
        "data",
        "items",
        "results",
      ]) {
        if (Array.isArray(nested[nestedKey])) {
          return nested[nestedKey] as ITrasanctionResponse[];
        }
      }
    }
  }

  // API sometimes returns a single transaction object
  if ("id" in obj || "txid" in obj || "amountToSend" in obj) {
    return [obj as unknown as ITrasanctionResponse];
  }

  return [];
}

export const getTransactionByPeriod = async (
  startDate: string,
  endDate: string,
): Promise<ITrasanctionResponse[]> => {
  const accessToken = getCookie("accessToken");
  const { data } = await instanceV2.get(
    `transactions/client/transactions?startDate=${startDate}&endDate=${endDate}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return normalizeTransactionList(data);
};

/** One 3-month window per call so the UI can append results progressively. */
export const fetchTransactionsByThreeMonths = async (
  endDateCursor: string | undefined,
): Promise<TransactionPeriodBatch> => {
  const minDate = getTransactionHistoryMinDate();

  // endDate = aujourd'hui (ou curseur de la page précédente) — fuseau local
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
  const transactions = await getTransactionByPeriod(startDate, endDate);

  // page suivante : la veille de startDate
  const next = start.clone().subtract(1, "day").startOf("day");

  return {
    transactions,
    startDate,
    endDate,
    nextCursor: next.format("DD-MM-YYYY"),
    hasMore: next.isSameOrAfter(minDate, "day"),
  };
};

export const fetchTransactionsForActiveDays = async (
  clientEmail: string,
  startFromDate: string | undefined,
  activeDaysCount: number,
): Promise<TransactionDayBatch> => {
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
    const transactions = await getTransactionByClientEmail(
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
};

export const getCardsByNetworkId = async (
  networkId: string,
): Promise<ICard> => {
  const accessToken = getCookie("accessToken");

  const { data: cards } = await instance.get(`country/get/cards/${networkId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return cards[Math.floor(Math.random() * cards.length)];
};

/**
 * Stats du mois courant — dérivées de
 * GET /v2/transactions/client/transactions (owner-scoped).
 * Ne plus appeler /v2/stats/* (interdit).
 */
export const getTransactionsStatsMonthly =
  async (): Promise<ITransactionStatsMonthlyResponse> => {
    const startDate = moment().startOf("month").format("DD-MM-YYYY");
    const endDate = moment().startOf("day").format("DD-MM-YYYY");
    const transactions = await getTransactionByPeriod(startDate, endDate);

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
  };

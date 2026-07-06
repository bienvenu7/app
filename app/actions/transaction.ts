import { instance, instanceV2 } from "@/config/instance";
import type { ICard } from "@/types/networks";
import { getCookie } from "@/config/cookies";
import moment from "moment";
import type {
  ITrasanctionData,
  ITrasanctionResponse,
  Status,
} from "../../types/transaction";

const MAX_CALENDAR_DAYS_TO_SCAN = 730;

export type TransactionDayBatch = {
  days: {
    dateKey: string;
    transactions: ITrasanctionResponse[];
  }[];
  nextCursor: string;
  hasMore: boolean;
};

export const createTransaction = async (
  transaction: ITrasanctionData,
): Promise<ITrasanctionResponse> => {
  const accessToken = getCookie("accessToken");
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
  const { data } = await instanceV2.patch(
    `transactions/${transactionId}`,
    { senderNumber, hour, status },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return data;
};

export const getTransactionById = async (
  transactionId: string,
): Promise<ITrasanctionResponse> => {
  const accessToken = getCookie("accessToken");

  const { data } = await instance.get(
    `transaction/get/by-id/${transactionId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return data;
};

export const getTransactionByClientEmail = async (
  clientEmail: string,
  date: string,
): Promise<ITrasanctionResponse[]> => {
  const accessToken = getCookie("accessToken");

  const { data } = await instance.get(
    `transaction/get/by-client/${clientEmail}/${date}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return data;
};

export const fetchTransactionsForActiveDays = async (
  clientEmail: string,
  startFromDate: string | undefined,
  activeDaysCount: number,
): Promise<TransactionDayBatch> => {
  let current = startFromDate
    ? moment(startFromDate, "DD-MM-YYYY", true)
    : moment().utc();

  if (!current.isValid()) {
    current = moment().utc();
  }

  const days: TransactionDayBatch["days"] = [];
  let scanned = 0;

  while (days.length < activeDaysCount && scanned < MAX_CALENDAR_DAYS_TO_SCAN) {
    const dateStr = current.format("DD-MM-YYYY");
    const transactions = await getTransactionByClientEmail(clientEmail, dateStr);

    if (transactions.length > 0) {
      days.push({ dateKey: dateStr, transactions });
    }

    current = current.subtract(1, "day");
    scanned++;
  }

  return {
    days,
    nextCursor: current.format("DD-MM-YYYY"),
    hasMore: days.length >= activeDaysCount,
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

import { instance, instanceV2 } from "@/config/instance";
import type { ICard } from "@/types/networks";
import { getCookie } from "@/config/cookies";
import type {
  ITrasanctionData,
  ITrasanctionResponse,
  Status,
} from "../../types/transaction";

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

export const getCardsByNetworkId = async (
  networkId: string,
): Promise<ICard> => {
  const accessToken = getCookie("accessToken");

  const { data: cards } = await instance.get(`country/get/cards/${networkId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return cards[Math.floor(Math.random() * cards.length)];
};

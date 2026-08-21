import type { ICard, INetworkResponse } from "./networks";

export enum Status {
  WAITING,
  INPROGRESS,
  CONFIRMED,
  ERROR,
  FINISH,
}

export type TxStatus =
  | "WAITING"
  | "INPROGRESS"
  | "CONFIRMED"
  | "ERROR"
  | "FINISH";

export type TxType = "SEND" | "RECEIVE";

/** Body create TX — inchangé (l'API ignore `clientEmail`). */
export interface ITrasanctionData {
  id?: string;
  code: string;
  /**
   * Requis par la validation API ; la valeur est ensuite écrasée par l'email du JWT.
   * Ne pas s'y fier pour l'ownership.
   */
  clientEmail: string;
  type: TxType | "";
  amountToSend: number;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  amountToPayOut: number;
  status: Status | TxStatus | string;
  networkId: string;
  fees: number;
  origin: string;
  dateTime: string;
}

export interface ITrasanctionDataReady extends ITrasanctionData {
  dateTime: string;
  direction: string;
}

/** Réponse TX v3 (create / patch / get-by-id / listes). */
export interface ITrasanctionResponse {
  id: string;
  txid: string;
  code: string;
  type: TxType;
  status: TxStatus | Status | string;
  amountToSend: number;
  amountToPayOut: number;
  fees: number;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  networkId: string;
  dateTime: string;
  hour?: string;
  createdAt: string;
  Network?: Pick<INetworkResponse, "name" | "pubicName">;
  card?: ICard;
}

export type ClientTransaction = ITrasanctionResponse;

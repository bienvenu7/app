import type { ICard, IFee, INetworkResponse, IFile } from "./networks";

export enum Status {
  WAITING,
  INPROGRESS,
  CONFIRMED,
  ERROR,
  FINISH,
}

export interface ITrasanctionData {
  id?: string;
  code: string;
  clientEmail: string;
  type: "SEND" | "RECEIVE" | "";
  amountToSend: number;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  amountToPayOut: number;
  status: Status | string;
  networkId: string;
  fees: number;
  origin: string;
  dateTime: string;
}

export interface ITrasanctionDataReady extends ITrasanctionData {
  dateTime: string;
  direction: string;
}

export interface ITrasanctionResponse extends ITrasanctionData {
  Rate: IFee;
  Network: INetworkResponse;
  files: IFile[];
  dateTime: string;
  hour: string;
  month: string;
  year: string;
  complain: string;
  adminCheck: string;
  agencyPhone: string;
  agencyFullName: string;
  createdAt: Date;
  card: ICard;
  receiverName: string;
  txid: string;
}

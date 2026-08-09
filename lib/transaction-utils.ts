import { getCountry, type Country } from "@/lib/data";
import type { Transaction } from "@/lib/storage";
import type { ITrasanctionResponse } from "@/types/transaction";
import { Status } from "@/types/transaction";

function findCountry(code: string) {
  if (!code) return undefined;
  return (
    getCountry(code) ??
    getCountry(code.toUpperCase()) ??
    getCountry(code.toLowerCase())
  );
}

export function parseTransactionRoute(code?: string) {
  const [fromCode, toCode] = (code ?? "").split("-");
  return {
    fromCode,
    toCode,
    from: findCountry(fromCode),
    to: findCountry(toCode),
  };
}

export function isWaitingStatus(status: Status | string | undefined) {
  return status === Status.WAITING || status === "WAITING";
}

export function isProcessingStatus(status: Status | string | undefined) {
  return status === Status.INPROGRESS || status === "INPROGRESS";
}

export function formatTransactionStatus(
  status: Status | string,
  labels?: Partial<Record<string, string>>,
) {
  const defaults: Record<string, string> = {
    [Status.WAITING]: "En attente",
    [Status.INPROGRESS]: "En cours",
    [Status.CONFIRMED]: "Confirmé",
    [Status.ERROR]: "Erreur",
    [Status.FINISH]: "Terminé",
    WAITING: "En attente",
    INPROGRESS: "En cours",
    CONFIRMED: "Confirmé",
    ERROR: "Erreur",
    FINISH: "Terminé",
  };
  const map = { ...defaults, ...labels };
  return map[status as string] ?? labels?.WAITING ?? defaults.WAITING;
}

export function isTransactionPaid(status: Status | string) {
  return (
    status === Status.CONFIRMED ||
    status === Status.FINISH ||
    status === "CONFIRMED" ||
    status === "FINISH"
  );
}

function splitName(fullName?: string) {
  const parts = fullName?.trim().split(/\s+/) ?? [];
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function toReceiptTransaction(tx: ITrasanctionResponse): Transaction {
  const { fromCode, toCode } = parseTransactionRoute(tx.code);
  const sender = splitName(tx.senderName);
  const recipient = splitName(tx.receiverName);

  return {
    txid: tx.txid,
    type: tx.type === "SEND" ? "send" : "receive",
    createdAt: tx.createdAt
      ? new Date(tx.createdAt).toISOString()
      : new Date().toISOString(),
    status: "completed",
    fromCode,
    toCode,
    amountSource: tx.amountToSend - tx.fees,
    fee: tx.fees,
    received: tx.amountToPayOut,
    senderFirstName: sender.firstName,
    senderLastName: sender.lastName,
    recipientFirstName: recipient.firstName,
    recipientLastName: recipient.lastName,
    recipientPhone: tx.receiverPhone,
    paymentMethod: tx.Network?.pubicName ?? tx.Network?.name ?? tx.networkId,
  };
}

export function getTransactionAmounts(
  tx: ITrasanctionResponse,
  from?: Country,
  to?: Country,
) {
  const baseAmount = tx.amountToSend - tx.fees;
  return {
    baseAmount,
    totalAmount: tx.amountToSend,
    fees: tx.fees,
    received: tx.amountToPayOut,
    from,
    to,
  };
}

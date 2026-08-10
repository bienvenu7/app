import { ICountry } from "@/types/country";

export type Country = {
  code: string;
  name: string;
  flag: string;
  currency: string;
  symbol: string;
};

// Russia is always one side of the transfer; the other side is an African country.
export const RUSSIA: Country = {
  code: "RU",
  name: "Russie",
  flag: "🇷🇺",
  currency: "RUB",
  symbol: "₽",
};

export const AFRICAN_COUNTRIES: Country[] = [
  {
    code: "civ",
    name: "Côte d'Ivoire",
    flag: "🇨🇮",
    currency: "XOF",
    symbol: "CFA",
  },
  {
    code: "sen",
    name: "Sénégal",
    flag: "🇸🇳",
    currency: "XOF",
    symbol: "CFA",
  },
  {
    code: "cam",
    name: "Cameroun",
    flag: "🇨🇲",
    currency: "XAF",
    symbol: "FCFA",
  },
  {
    code: "cg",
    name: "Congo",
    flag: "🇨🇬",
    currency: "XAF",
    symbol: "FCFA",
  },
  {
    code: "ru",
    name: "Russia",
    flag: "🇷🇺",
    currency: "RUB",
    symbol: "₽",
  },
];

export const ALL_COUNTRIES = [RUSSIA, ...AFRICAN_COUNTRIES];

export function getCountry(code: string): Country | undefined {
  return ALL_COUNTRIES.find((c) => c.code === code);
}

export const getCountryWithId = (
  countries: ICountry[] | null,
  id: string | undefined,
) => countries?.find((el) => el.name === id);

export type PaymentMethod = {
  id: string;
  label: string;
  hint: string;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "orange", label: "Orange Money", hint: "Mobile Money" },
  { id: "mtn", label: "MTN MoMo", hint: "Mobile Money" },
  { id: "wave", label: "Wave", hint: "Mobile Money" },
  { id: "moov", label: "Moov Money", hint: "Mobile Money" },
  { id: "bank", label: "Virement bancaire", hint: "Compte bancaire" },
  { id: "cash", label: "Retrait en agence", hint: "Espèces" },
];

export function getPaymentMethod(id: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

// Fee model: 1.5% of amount + fixed, min applied.
export function computeQuote(amountSource: number, from: Country, to: Country) {
  const feeRate = 0.015;
  const fee = Math.max(amountSource * feeRate, 0);
  const amountAfterFee = Math.max(amountSource - fee, 0);
  // convert source -> base -> target
  const inBase = amountAfterFee * 1;
  const received = inBase / 1;
  return {
    fee,
    received,
  };
}

export function formatMoney(value: number, country: Country) {
  const rounded =
    country.currency === "XOF" ||
    country.currency === "XAF" ||
    country.currency === "NGN"
      ? Math.round(value)
      : Math.round(value * 100) / 100;
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} ${country.symbol}`;
}

export type TransferAmounts = {
  fee: number;
  totalToPay: number;
  convertAmount: number;
  amountToPayOut: number;
};

export function computeTransferAmounts(
  amount: number,
  feePercent: number,
  rate: number,
  feesIncluded: boolean,
): TransferAmounts {
  if (amount <= 0) {
    return { fee: 0, totalToPay: 0, convertAmount: 0, amountToPayOut: 0 };
  }

  const feeRate = feePercent / 100;

  if (feesIncluded) {
    const fee = amount * feeRate;
    const convertAmount = amount - fee;
    return {
      fee,
      totalToPay: amount,
      convertAmount,
      amountToPayOut: convertAmount * rate,
    };
  }

  const fee = amount * feeRate;
  return {
    fee,
    totalToPay: amount + fee,
    convertAmount: amount,
    amountToPayOut: amount * rate,
  };
}

/** Inverse of computeTransferAmounts: payout → send-side amount. */
export function computeSendAmountFromPayout(
  payout: number,
  feePercent: number,
  rate: number,
  feesIncluded: boolean,
): number {
  if (payout <= 0 || rate <= 0) return 0;

  const feeRate = feePercent / 100;

  if (feesIncluded) {
    const divisor = rate * (1 - feeRate);
    if (divisor <= 0) return 0;
    return payout / divisor;
  }

  return payout / rate;
}

export function roundAmountForCountry(value: number, country: Country): number {
  if (
    country.currency === "XOF" ||
    country.currency === "XAF" ||
    country.currency === "NGN"
  ) {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

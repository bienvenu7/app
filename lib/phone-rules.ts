import type { ICountry } from "@/types/country";

/**
 * Contrat serveur (`FRONTEND_CLIENT_WHATSAPP.md`) : `^\d{9,15}$`.
 * Le serveur ne normalise pas — n'envoyer que des chiffres.
 */
export const WHATSAPP_PATTERN = /^\d{9,15}$/;

export const LOGIN_OTP_TTL_MS = 2 * 60 * 1000;
export const RESET_OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Indicatif (sans +) et longueur du numéro national.
 * L'API publique ne renvoie plus `TelIndex` / `TelMaxNumber` sur le pays.
 */
export type CountryPhoneRule = {
  index: string;
  localDigits: number;
  example: string;
};

const RULES_BY_CODE: Record<string, CountryPhoneRule> = {
  cg: { index: "242", localDigits: 9, example: "242061234567" },
  cam: { index: "237", localDigits: 9, example: "237612345678" },
  civ: { index: "225", localDigits: 10, example: "2250701234567" },
  sen: { index: "221", localDigits: 9, example: "221771234567" },
  ru: { index: "7", localDigits: 10, example: "79025227326" },
};

const RULES_BY_NAME: Record<string, CountryPhoneRule> = {
  congo: RULES_BY_CODE.cg,
  "republique du congo": RULES_BY_CODE.cg,
  "république du congo": RULES_BY_CODE.cg,
  cameroun: RULES_BY_CODE.cam,
  cameroon: RULES_BY_CODE.cam,
  "cote d'ivoire": RULES_BY_CODE.civ,
  "côte d'ivoire": RULES_BY_CODE.civ,
  senegal: RULES_BY_CODE.sen,
  sénégal: RULES_BY_CODE.sen,
  russie: RULES_BY_CODE.ru,
  russia: RULES_BY_CODE.ru,
};

/** Chiffres seuls, max 15 — ce que le serveur accepte. */
export function sanitizeWhatsappInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

export function phoneDigits(phone: string): string {
  return sanitizeWhatsappInput(phone);
}

export function normalizePhone(phone: string): string {
  return sanitizeWhatsappInput(phone);
}

/** Ancien compte : `whatsappNumber` vaut souvent `"-"`. */
export function displayWhatsappNumber(
  whatsappNumber: string | undefined | null,
): string {
  if (!whatsappNumber || whatsappNumber === "-") return "";
  return sanitizeWhatsappInput(whatsappNumber);
}

export function hasWhatsappOtpChannel(
  whatsappNumber: string | undefined | null,
): boolean {
  const digits = displayWhatsappNumber(whatsappNumber);
  if (!digits) return false;
  return WHATSAPP_PATTERN.test(digits);
}

export type OtpChannel = "whatsapp" | "email" | "unknown";

export function otpChannelFromStoredNumber(
  whatsappNumber: string | undefined | null,
  options?: { unknownIfMissing?: boolean },
): OtpChannel {
  if (options?.unknownIfMissing && whatsappNumber == null) return "unknown";
  return hasWhatsappOtpChannel(whatsappNumber) ? "whatsapp" : "email";
}

export function phoneRuleForCountry(
  country?: Pick<ICountry, "name" | "pubicName"> | null,
): CountryPhoneRule | null {
  if (!country) return null;
  const byCode = RULES_BY_CODE[country.name.trim().toLowerCase()];
  if (byCode) return byCode;
  return RULES_BY_NAME[country.pubicName.trim().toLowerCase()] ?? null;
}

export type PhoneCountryCheck =
  | { ok: true; digits: string; rule: CountryPhoneRule | null }
  | { ok: false; reason: "empty" | "format"; rule: CountryPhoneRule | null };

/**
 * Chiffres uniquement, indicatif inclus, longueur du pays si connue.
 * Sinon repli sur `^\d{9,15}$` (contrat serveur).
 */
export function checkPhoneForCountry(
  phone: string,
  country?: Pick<ICountry, "name" | "pubicName"> | null,
): PhoneCountryCheck {
  const digits = sanitizeWhatsappInput(phone);
  const rule = phoneRuleForCountry(country);

  if (!digits) return { ok: false, reason: "empty", rule };

  if (rule) {
    const expectedLength = rule.index.length + rule.localDigits;
    const matches =
      digits.startsWith(rule.index) && digits.length === expectedLength;
    if (!matches) return { ok: false, reason: "format", rule };
    return { ok: true, digits, rule };
  }

  if (!WHATSAPP_PATTERN.test(digits)) {
    return { ok: false, reason: "format", rule: null };
  }
  return { ok: true, digits, rule: null };
}

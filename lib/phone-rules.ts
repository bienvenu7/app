import type { ICountry } from "@/types/country";

/**
 * Indicatif (sans +) et longueur du numéro national.
 * L'API publique ne renvoie plus `TelIndex` / `TelMaxNumber` sur le pays ;
 * ces valeurs reprennent l'ancien contrat (Congo : +242 / 9 chiffres).
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
  ru: { index: "7", localDigits: 10, example: "79123456789" },
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

export function phoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

export function normalizePhone(phone: string): string {
  return phoneDigits(phone);
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
  | { ok: true; digits: string; rule: CountryPhoneRule }
  | { ok: false; reason: "empty" | "format"; rule: CountryPhoneRule }
  | { ok: false; reason: "unknown_country" };

/**
 * Le numéro doit être l'indicatif (sans +) suivi d'exactement `localDigits`
 * chiffres. Espaces, tirets, + et préfixe 00 sont ignorés.
 * Russie : le 8 national est accepté à la place du 7.
 */
export function checkPhoneForCountry(
  phone: string,
  country?: Pick<ICountry, "name" | "pubicName"> | null,
): PhoneCountryCheck {
  const rule = phoneRuleForCountry(country);
  if (!rule) return { ok: false, reason: "unknown_country" };

  const trimmed = phone.trim();
  if (!trimmed) return { ok: false, reason: "empty", rule };

  let digits = phoneDigits(trimmed);

  if (
    rule.index === "7" &&
    digits.startsWith("8") &&
    digits.length === 1 + rule.localDigits
  ) {
    digits = `7${digits.slice(1)}`;
  }

  const expectedLength = rule.index.length + rule.localDigits;
  const matches =
    digits.startsWith(rule.index) && digits.length === expectedLength;

  if (!matches) return { ok: false, reason: "format", rule };
  return { ok: true, digits, rule };
}

import type { INetworkResponse } from "@/types/networks";

export type AutoNetworkCountry = "cg" | "cam";

/** Expand inclusive numeric ranges into digit-prefix strings, e.g. [655,659] → ["655"…"659"]. */
function rangePrefixes(from: number, to: number): string[] {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(String(n));
  return out;
}

const CONGO_RULES: { operator: "mtn" | "airtel"; prefixes: string[] }[] = [
  { operator: "mtn", prefixes: ["06"] },
  { operator: "airtel", prefixes: ["05"] },
];

const CAMEROON_RULES: { operator: "mtn" | "orange"; prefixes: string[] }[] = [
  {
    operator: "mtn",
    prefixes: [
      "650",
      "651",
      "652",
      "653",
      "654",
      "681",
      "682",
      "683",
      "684",
      "671",
      "672",
      "673",
      "674",
      "675",
      "676",
      "677",
      "678",
      "679",
    ],
  },
  {
    operator: "orange",
    prefixes: [
      ...rangePrefixes(655, 659),
      ...rangePrefixes(690, 699),
      ...rangePrefixes(640, 641),
      ...rangePrefixes(686, 689),
    ],
  },
];

function normalizeCountryCode(code?: string): AutoNetworkCountry | null {
  const c = (code ?? "").trim().toLowerCase();
  if (c === "cg" || c === "congo" || c === "cog") return "cg";
  if (
    c === "cam" ||
    c === "cm" ||
    c === "cmr" ||
    c === "cameroon" ||
    c === "cameroun"
  ) {
    return "cam";
  }
  return null;
}

function networkMatchesOperator(
  network: INetworkResponse,
  operator: string,
): boolean {
  const haystack = `${network.name} ${network.pubicName}`.toLowerCase();
  return haystack.includes(operator);
}

function findOperatorByPhone(
  country: AutoNetworkCountry,
  phone: string,
): string | null {
  const rules = country === "cg" ? CONGO_RULES : CAMEROON_RULES;
  for (const rule of rules) {
    if (rule.prefixes.some((prefix) => phone.startsWith(prefix))) {
      return rule.operator;
    }
  }
  return null;
}

/**
 * Detects MTN / Airtel / Orange from the recipient phone prefix
 * for Congo (cg) and Cameroun (cam). Returns the matching network id, or null.
 */
export function detectNetworkFromPhone(
  phone: string,
  countryCode: string | undefined,
  networks: INetworkResponse[] | undefined | null,
): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits || !networks?.length) return null;

  const country = normalizeCountryCode(countryCode);
  if (!country) return null;

  const operator = findOperatorByPhone(country, digits);
  if (!operator) return null;

  const match = networks.find((n) => networkMatchesOperator(n, operator));
  return match?.id ?? null;
}

export function supportsAutoNetworkDetection(countryCode?: string): boolean {
  return normalizeCountryCode(countryCode) !== null;
}

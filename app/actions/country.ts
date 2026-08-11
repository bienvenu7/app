import { instance } from "@/config/instance";
import type { ICountry, IRate, IShedule } from "@/types/country";
import type { IResponseCard } from "@/types/networks";
import { getAccessToken } from "@/config/cookies";

/**
 * Ne conserve que les champs publics documentés.
 * Ignore solde (`total`), admins (`adimin`), Fund, Cost, etc. s'ils fuient encore.
 */
export function toPublicCountry(raw: unknown): ICountry | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" && typeof c.id !== "number") return null;
  if (typeof c.name !== "string") return null;

  const shedule =
    c.shedule && typeof c.shedule === "object"
      ? (c.shedule as IShedule)
      : undefined;

  return {
    id: String(c.id),
    pubicName: String(c.pubicName ?? c.name),
    name: c.name,
    currency: String(c.currency ?? ""),
    TelIndex: String(c.TelIndex ?? ""),
    TelMaxNumber:
      typeof c.TelMaxNumber === "number" || typeof c.TelMaxNumber === "string"
        ? c.TelMaxNumber
        : "",
    formatNumber: String(c.formatNumber ?? ""),
    createdAt:
      typeof c.createdAt === "string" || c.createdAt instanceof Date
        ? c.createdAt
        : undefined,
    shedule,
  };
}

function toPublicCountries(raw: unknown): ICountry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(toPublicCountry)
    .filter((c): c is ICountry => c != null);
}

export const getCountries = async (): Promise<ICountry[]> => {
  const { data } = await instance.get("/country/get-countries");
  return toPublicCountries(data);
};

export const getCountryById = async (id: string): Promise<ICountry> => {
  const { data } = await instance.get(`/country/get-country/${id}`);
  const country = toPublicCountry(data);
  if (!country) {
    throw new Error("get-country: invalid public country payload");
  }
  return country;
};

export const getRate = async (code: string): Promise<IRate> => {
  const { data } = await instance.get(`/rate/get/rate/${code}`);
  return data;
};

export const getCards = async (countryId: string): Promise<IResponseCard[]> => {
  const token = getAccessToken();
  const { data } = await instance.get(`/country/get/cards/${countryId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
};

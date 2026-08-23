"use server";

import { instance } from "@/config/instance";
import type { ICountry, IRate, IShedule } from "@/types/country";
import type { IResponseCard } from "@/types/networks";
import { withAuthError } from "@/lib/auth-errors";

function toPublicShedule(raw: unknown): IShedule | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.workingDate)) return undefined;
  return {
    workingDate: s.workingDate as number[],
    workingFrom: Number(s.workingFrom),
    workingTo: Number(s.workingTo),
  };
}

function toPublicCountry(raw: unknown): ICountry | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" && typeof c.id !== "number") return null;
  if (typeof c.name !== "string") return null;

  return {
    id: String(c.id),
    pubicName: String(c.pubicName ?? c.name),
    name: c.name,
    shedule: toPublicShedule(c.shedule),
  };
}

function toPublicCountries(raw: unknown): ICountry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toPublicCountry).filter((c): c is ICountry => c != null);
}

export async function loadPublicCountries(): Promise<ICountry[]> {
  const { data } = await instance.get("/country/get-countries");
  return toPublicCountries(data);
}

export const getCountries = async (): Promise<ICountry[]> => {
  return withAuthError(loadPublicCountries) as Promise<ICountry[]>;
};

export const getCountryById = async (id: string): Promise<ICountry> => {
  return withAuthError(async () => {
    const { data } = await instance.get(`/country/get-country/${id}`);
    const country = toPublicCountry(data);
    if (!country) {
      throw new Error("get-country: invalid public country payload");
    }
    return country;
  }) as Promise<ICountry>;
};

export const getRate = async (code: string): Promise<IRate> => {
  return withAuthError(async () => {
    const { data } = await instance.get(`/rate/get/rate/${code}`);
    return data;
  }) as Promise<IRate>;
};

export const getCards = async (countryId: string): Promise<IResponseCard[]> => {
  return withAuthError(async () => {
    const { data } = await instance.get(`/country/get/cards/${countryId}`);
    return data;
  }) as Promise<IResponseCard[]>;
};

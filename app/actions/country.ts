import { instance, instanceV2 } from "@/config/instance";
import type { ICountry, IRate, IShedule } from "@/types/country";
import type { IResponseCard } from "@/types/networks";
import { getCookie } from "@/config/cookies";

export const getCountries = async () => {
  const { data } = await instance.get("/country/get-countries");
  return data as ICountry[];
};

export const getCountryById = async (id: string) => {
  const { data } = await instance.get(`/country/get-country/${id}`);

  return data as ICountry;
};

export const getRate = async (code: string): Promise<IRate> => {
  const { data } = await instance.get(`/rate/get/rate/${code}`);
  return data;
};

export const getCards = async (countryId: string): Promise<IResponseCard[]> => {
  const token = getCookie("accessToken");
  const { data } = await instance.get(`/country/get/cards/${countryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
};

export const getShedule = async (id: string): Promise<IShedule> => {
  const token = getCookie("accessToken");
  const { data } = await instanceV2.get(`/setting/shedule/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
};

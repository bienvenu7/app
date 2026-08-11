"use client";
import {
  getCards,
  getCountries,
  getCountryById,
  getRate,
} from "@/app/actions/country";
import { getDirections } from "@/app/actions/directions";
import { useQuery } from "@tanstack/react-query";

export const useGetCountries = () => {
  const {
    data: countries,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["countries"],
    queryFn: () => getCountries(),
  });
  return { countries, isLoading, isError };
};

export const useGetCountriesById = (countryId: string) => {
  const {
    data: country,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["country", countryId],
    queryFn: () => getCountryById(countryId),
    enabled: !!countryId,
  });
  return { country, isLoading, isError };
};

export const useGetRateByCode = (code: string) => {
  const {
    data: rate,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["rate", code],
    queryFn: () => getRate(code),
  });
  return { rate, isLoading, isError };
};

export const useGetCards = (networkId: string | undefined) => {
  const {
    data: cards,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["cards", networkId],
    queryFn: () => getCards(networkId!),
    enabled: !!networkId,
  });
  return { cards, isLoading, isError };
};

/**
 * Horaires : utiliser `country.shedule` (réponse publique get-countries).
 * L'ancien GET /v2/setting/shedule est retiré (route interdite).
 */
export const useGetSheduleFromCountries = (countryId: string | undefined) => {
  const { countries, isLoading, isError } = useGetCountries();
  const shedule = (countries ?? []).find((c) => c.id === countryId)?.shedule;
  return { shedule, isLoading, isError };
};

export const useGetDirections = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["get/directions"],
    queryFn: () => getDirections(),
  });
  return { data, isLoading };
};

export const useGetRate = (code: string | undefined) => {
  const { data, isLoading } = useQuery({
    queryKey: ["get/rates", code],
    queryFn: () => getRate(code!),
    enabled: !!code,
  });
  return { data, isLoading };
};

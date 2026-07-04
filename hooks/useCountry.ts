"use client";
import {
  getCards,
  getCountries,
  getCountryById,
  getRate,
  getShedule,
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

export const useGetShedule = (id: string | undefined) => {
  const {
    data: shedule,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["shedule", id],
    queryFn: () => getShedule(id!),
    enabled: !!id,
  });
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

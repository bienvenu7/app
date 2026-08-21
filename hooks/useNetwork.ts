"use client";
import { getNetworkByAmount, getNetworksById } from "@/app/actions/network";
import { unwrapAction } from "@/lib/auth-errors";
import { useQuery } from "@tanstack/react-query";

export const useGetNetworksById = (id: string | undefined) => {
  const {
    isPending: isLoggingNetwork,
    isError: isNetworkError,
    data: network,
  } = useQuery({
    queryKey: ["network", id],
    queryFn: () => unwrapAction(getNetworksById(id!)),
    enabled: !!id,
  });
  return { network, isNetworkError, isLoggingNetwork };
};

export const useGetNetworkByAmount = (networkId: string, amount: string) => {
  const {
    isPending: isLoggingRate,
    isError: isRateError,
    data: rate,
  } = useQuery({
    queryKey: ["network", networkId, amount],
    queryFn: () => unwrapAction(getNetworkByAmount(networkId, amount)),
  });
  return { isLoggingRate, isRateError, rate };
};

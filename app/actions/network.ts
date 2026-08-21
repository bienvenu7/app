"use server";

import { instance } from "@/config/instance";
import type { IFee, INetworkResponse } from "@/types/networks";
import { withAuthError } from "@/lib/auth-errors";

export const getNetworksById = async (
  id: string,
): Promise<INetworkResponse[]> => {
  return withAuthError(async () => {
    const { data } = await instance.get(`/network/get-networks/${id}`);
    return data as INetworkResponse[];
  }) as Promise<INetworkResponse[]>;
};

/** Non consommé par l'UI v3 — conservé pour le hook existant. */
export const getNetworkByAmount = async (
  networkId: string,
  amount: string,
): Promise<IFee> => {
  return withAuthError(async () => {
    const { data } = await instance.get(`/fee/get-fee/${networkId}/${amount}`);
    return data;
  }) as Promise<IFee>;
};

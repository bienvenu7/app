import { instance } from "@/config/instance";
import type { IFee, INetworkResponse } from "@/types/networks";

export const getNetworksById = async (
  id: string,
): Promise<INetworkResponse[]> => {
  const { data } = await instance.get(`/network/get-networks/${id}`);
  return data as INetworkResponse[];
};

export const getNetworkByAmount = async (
  networkId: string,
  amount: string,
): Promise<IFee> => {
  const { data } = await instance.get(`/fee/get-fee/${networkId}/${amount}`);
  return data;
};

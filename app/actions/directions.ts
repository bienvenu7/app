import { instanceV2 } from "@/config/instance";
import type { IDirection } from "@/types/country";
import { getCookie } from "@/config/cookies";

export const getDirections = async (): Promise<IDirection[]> => {
  const accessToken = getCookie("accessToken");
  const { data } = await instanceV2.get("directions/get", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return data;
};

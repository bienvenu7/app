"use server";

import { instance } from "@/config/instance";
import type { IDirection } from "@/types/country";
import { withAuthError } from "@/lib/auth-errors";

export const getDirections = async (): Promise<IDirection[]> => {
  return withAuthError(async () => {
    const { data } = await instance.get("directions/get");
    return data;
  }) as Promise<IDirection[]>;
};

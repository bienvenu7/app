import { instance, instanceV2 } from "@/config/instance";
import type { IClientResponse, IClientUpdate } from "@/types/user";
import { deleteCookie, getCookie, setCookie } from "@/config/cookies";

export const updateClient = async (data: IClientUpdate): Promise<string> => {
  const accessToken = getCookie("accessToken");
  const { status } = await instance.patch("auth/update/user", data, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (status === 200) {
    await instance.get("auth/logout", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    deleteCookie(["accessToken", "refreshToken", "uuid"]);
  }
  return "Vos identifiants ont été mises à jour correctement, vous serez déconnecté dans un instant pour assurer que vos données ont été mise à jour correctement";
};

export const register = async (
  email: string,
  password: string,
  fullName: string,
  countryId: string,
  gender: string,
): Promise<{ message: string }> => {
  const { data } = await instanceV2.post("clients/register", {
    email,
    password,
    fullName,
    countryId,
    gender,
  });
  return data;
};

export const confirmEmail = async (hash: string) => {
  const data = await instance.post("auth/confirm-email", {
    hash,
  });
  return data;
};

export const reconfirmEmail = async (hash: string) => {
  try {
    const { data, status } = await instance.post("auth/resend-email", {
      hash,
    });
    console.table({ data, status });
    return data;
  } catch (error: any) {
    console.log(error.response.data.message);
    return error.response.data.message;
  }
};

export const login = async (email: string, password: string) => {
  await instance.post("auth/login", {
    email,
    password,
  });
  return "done";
};

export const updatePassword = async (
  email: string,
  password: string,
): Promise<{ message: string }> => {
  const { data } = await instanceV2.patch("clients/reset-password", {
    email,
    password,
  });
  return data;
};

type VerifyOtpResponse = {
  accessToken?: string;
  access_token?: string;
};

//

export const confirmOtp = async (email: string, newOtp: string) => {
  const { data } = await instance.post<VerifyOtpResponse>(
    "auth/verify-otp",
    {
      email,
      otp: newOtp,
    },
    {
      withCredentials: true,
    },
  );

  const accessToken = data.accessToken ?? data.access_token ?? null;
  if (!accessToken) {
    throw new Error("verify-otp: missing accessToken in response");
  }

  setCookie("accessToken", accessToken, 30);
  return data;
};

export const confirmOtpUpdate = async (
  email: string,
  newOtp: string[],
): Promise<number> => {
  let otp = "";

  newOtp.map((el) => (otp = otp + el));

  const { status } = await instance.post("auth/verify-otp", {
    email,
    otp,
  });

  return status;
};

export const resendOtp = async (email: string) => {
  const response = await instance.post("auth/resend-otp", {
    email,
  });
  return response;
};

export const getAuth = async (): Promise<IClientResponse> => {
  const accessToken = getCookie("accessToken");
  const { data } = await instance.get("auth/get-auth", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
};

export const logout = async () => {
  const accessToken = getCookie("accessToken");
  await instance.get("auth/logout", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  deleteCookie(["accessToken", "refreshToken", "uuid"]);
  return "done";
};

export const refresh = async (): Promise<{ accessToken: string }> => {
  const { data } = await instance.get("auth/refresh-token", {
    withCredentials: true,
  });
  setCookie("accessToken", data.accessToken);
  return data;
};

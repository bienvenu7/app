import { instance, instanceV2 } from "@/config/instance";
import { getCookie } from "@/config/cookies";

export interface IResponseFile {
  id: string;
  filename: string;
  filepath: string;
  mimetype: string;
  createdAt: Date;
  transactionId: string;
}

export interface IReceipt {
  id: string;
  filename: string;
  uri: string;
}

export const uploadFiles = async (
  files: File[],
  id: string,
  comment: string,
): Promise<IResponseFile | IResponseFile[]> => {
  const accessToken = getCookie("accessToken");
  const formData = new FormData();
  files.forEach((file) => formData.append("file", file));
  formData.append("comment", comment);

  const { data } = await instance.post(`file/upload/${id}`, formData, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return data;
};

export const uploafFile = async (
  file: File,
  id: string,
  comment: string,
): Promise<IResponseFile> => {
  const data = await uploadFiles([file], id, comment);
  return Array.isArray(data) ? data[0] : data;
};

export const getReceipt = async (id: string): Promise<IReceipt> => {
  const accessToken = getCookie("accessToken");
  const { data } = await instanceV2.get(
    `files/receipt?txid=${id}&page=1&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  return data;
};

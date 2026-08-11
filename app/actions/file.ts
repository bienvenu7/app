import { instance, instanceV2 } from "@/config/instance";
import { getAccessToken } from "@/config/cookies";
import { AuthHttpError, toAuthHttpError } from "@/lib/auth-errors";
import {
  MAX_PROOF_FILES,
  MAX_PROOF_FILE_BYTES,
  isAllowedProofMime,
} from "@/lib/upload-proof";

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

function bearerHeaders(): { Authorization: string } | Record<string, never> {
  const accessToken = getAccessToken();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export const uploadFiles = async (
  files: File[],
  id: string,
  comment: string,
): Promise<IResponseFile | IResponseFile[]> => {
  if (!files.length || files.length > MAX_PROOF_FILES) {
    throw new AuthHttpError(400, "validation", "invalid_file_count");
  }
  for (const file of files) {
    if (!isAllowedProofMime(file.type) || file.size > MAX_PROOF_FILE_BYTES) {
      throw new AuthHttpError(400, "validation", "invalid_file");
    }
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("file", file));
  formData.append("comment", comment);

  try {
    const { data } = await instance.post(`file/upload/${id}`, formData, {
      headers: bearerHeaders(),
    });
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

export const uploafFile = async (
  file: File,
  id: string,
  comment: string,
): Promise<IResponseFile> => {
  const data = await uploadFiles([file], id, comment);
  return Array.isArray(data) ? data[0] : data;
};

export const getReceipt = async (id: string): Promise<IReceipt | null> => {
  try {
    const { data } = await instanceV2.get(
      `files/receipt?txid=${id}&page=1&limit=1`,
      {
        headers: bearerHeaders(),
      },
    );
    if (!data) return null;
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped?.code === "not_found" || mapped?.code === "forbidden") {
      return null;
    }
    if (mapped) throw mapped;
    throw error;
  }
};

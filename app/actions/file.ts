"use server";

import { instance } from "@/config/instance";
import { AuthHttpError, withAuthError } from "@/lib/auth-errors";
import { apiPathSegment } from "@/lib/api-path";
import { requireAccessToken } from "@/lib/require-auth";
import {
  MAX_PROOF_FILES,
  MAX_PROOF_FILE_BYTES,
  isAllowedProofMime,
} from "@/lib/upload-proof";

type UploadProofResponse = { ok: true };

export const uploadFiles = async (
  files: File[],
  id: string,
  comment: string,
): Promise<UploadProofResponse> => {
  return withAuthError(async () => {
    await requireAccessToken();
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

    const { data } = await instance.post(
      `file/upload/${apiPathSegment(id)}`,
      formData,
    );
    return data ?? { ok: true as const };
  }) as Promise<UploadProofResponse>;
};

export const uploafFile = async (
  file: File,
  id: string,
  comment: string,
): Promise<UploadProofResponse> => {
  return uploadFiles([file], id, comment);
};

/** Endpoint v3 `files/receipt` = 410 — plus consommé. */
export const getReceipt = async (_id: string): Promise<null> => {
  return null;
};

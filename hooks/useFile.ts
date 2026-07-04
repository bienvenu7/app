"use client";
import { uploafFile } from "@/app/actions/file";
import { useMutation } from "@tanstack/react-query";

export const useUploadFile = (file: File, id: string, comment: string) => {
  const { isError, isPending, mutateAsync, isSuccess } = useMutation({
    mutationKey: ["file", id],
    mutationFn: () => uploafFile(file, id, comment),
  });
  return { isError, isPending, mutateAsync, isSuccess };
};

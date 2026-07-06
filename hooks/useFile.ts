"use client";
import { IReceipt, getReceipt, uploafFile } from "@/app/actions/file";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useUploadFile = (file: File, id: string, comment: string) => {
  const { isError, isPending, mutateAsync, isSuccess } = useMutation({
    mutationKey: ["file", id],
    mutationFn: () => uploafFile(file, id, comment),
  });
  return { isError, isPending, mutateAsync, isSuccess };
};

export const useGetReceipt = (id: string | undefined) => {
  const { isError, isPending, data, isSuccess } = useQuery({
    queryKey: ["receipt", id],
    queryFn: () => getReceipt(id!),
    enabled: !!id,
  });
  return { isError, isPending, data, isSuccess };
};

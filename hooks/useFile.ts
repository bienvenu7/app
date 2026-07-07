"use client";
import { sendMessage } from "@/app/actions/chatbot";
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

export const useSendMessage = (message: string) => {
  const { data, isPending, mutateAsync, error } = useMutation({
    mutationFn: sendMessage,
    mutationKey: [message],
  });
  return { data, isPending, mutateAsync, error };
};

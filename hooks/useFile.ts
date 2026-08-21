"use client";
import { sendMessage } from "@/app/actions/chatbot";
import { getReceipt, uploafFile } from "@/app/actions/file";
import { unwrapAction } from "@/lib/auth-errors";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useUploadFile = (file: File, id: string, comment: string) => {
  const { isError, isPending, mutateAsync, isSuccess } = useMutation({
    mutationKey: ["file", id],
    mutationFn: () => unwrapAction(uploafFile(file, id, comment)),
  });
  return { isError, isPending, mutateAsync, isSuccess };
};

export const useGetReceipt = (id: string | undefined) => {
  const { isError, isPending, data, isSuccess } = useQuery({
    queryKey: ["receipt", id],
    queryFn: () => unwrapAction(getReceipt(id!)),
    enabled: !!id,
  });
  return {
    isError,
    isPending,
    data: data ?? null,
    isSuccess,
  };
};

export const useSendMessage = (message: string) => {
  const { data, isPending, mutateAsync, error } = useMutation({
    mutationFn: (message: string) => unwrapAction(sendMessage(message)),
    mutationKey: [message],
  });
  return { data, isPending, mutateAsync, error };
};

"use client";
import {
  createTransaction,
  getTransactionByClientEmail,
  getTransactionById,
  updateTransaction,
} from "@/app/actions/transaction";
import type { ITrasanctionData } from "@/types/transaction";
import { Status } from "@/types/transaction";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const useCreateTransaction = (data: ITrasanctionData) => {
  const queryClient = useQueryClient();
  const {
    isPending: isCreatingTransaction,
    isError: isCreatingTransactionError,
    mutateAsync,
  } = useMutation({
    mutationKey: ["transaction", data],
    mutationFn: () => createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction"] });
    },
  });
  return { mutateAsync, isCreatingTransaction, isCreatingTransactionError };
};

export const useGetTransactonById = (id: string | undefined) => {
  const {
    isPending: isGettingTransaction,
    isError: isTransactionError,
    data: transaction,
    refetch,
  } = useQuery({
    queryKey: ["transaction", id],
    queryFn: () => getTransactionById(id!),
    enabled: !!id,
  });
  return { transaction, isGettingTransaction, isTransactionError, refetch };
};

export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();
  const {
    isPending: isUpdatingTransaction,
    isError: isUpdatingTransactionError,
    mutateAsync,
  } = useMutation({
    mutationFn: ({
      transactionId,
      senderNumber,
      hour,
      status,
    }: {
      transactionId: string;
      senderNumber: string;
      hour: string;
      status: Status;
    }) => updateTransaction(transactionId, senderNumber, hour, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction"] });
    },
  });
  return { mutateAsync, isUpdatingTransaction, isUpdatingTransactionError };
};

export const useGetTransactonByEmail = (
  email: string | undefined,
  date: string,
) => {
  const {
    isPending: isGettingTransaction,
    isError: isTransactionError,
    data: transactions,
  } = useQuery({
    queryKey: ["transaction", email, date],
    queryFn: () => getTransactionByClientEmail(email!, date),
    refetchInterval: 1000 * 5,
    enabled: !!email && !!date,
  });
  return { transactions, isGettingTransaction, isTransactionError };
};

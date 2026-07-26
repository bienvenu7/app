"use client";
import {
  createTransaction,
  fetchTransactionsByThreeMonths,
  getTransactionByClientEmail,
  getTransactionById,
  getTransactionsStatsMonthly,
  updateTransaction,
} from "@/app/actions/transaction";
import type { ITrasanctionData } from "@/types/transaction";
import { Status } from "@/types/transaction";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

/** Refresh home stats + transactions list after create/update. */
export function invalidateTransactionQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["transaction"] }),
    queryClient.resetQueries({ queryKey: ["transactions-infinite"] }),
    queryClient.invalidateQueries({ queryKey: ["transaction-stats-monthly"] }),
    queryClient.invalidateQueries({
      queryKey: ["transaction-stats-monthly-by-email"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["transaction-stats-monthly-by-period"],
    }),
  ]);
}

export const useCreateTransaction = (data: ITrasanctionData) => {
  const queryClient = useQueryClient();
  const {
    isPending: isCreatingTransaction,
    isError: isCreatingTransactionError,
    mutateAsync,
  } = useMutation({
    mutationKey: ["transaction", data],
    mutationFn: () => createTransaction(data),
    onSuccess: async () => {
      await invalidateTransactionQueries(queryClient);
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
    onSuccess: async () => {
      await invalidateTransactionQueries(queryClient);
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

export const useGetTransactionStatsMonthly = (email: string | undefined) => {
  const {
    isPending: isGettingStats,
    isError: isStatsError,
    data: stats,
  } = useQuery({
    queryKey: ["transaction-stats-monthly", email],
    queryFn: () => getTransactionsStatsMonthly(),
    refetchInterval: 1000 * 5,
  });
  return { stats, isGettingStats, isStatsError };
};

export const useInfiniteTransactionsByEmail = (email: string | undefined) => {
  const {
    data,
    isPending: isGettingTransaction,
    isError: isTransactionError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["transactions-infinite", email],
    queryFn: ({ pageParam }) => fetchTransactionsByThreeMonths(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!email,
    refetchInterval: 1000 * 5,
  });

  return {
    data,
    isGettingTransaction,
    isTransactionError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
};

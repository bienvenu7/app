"use client";
import {
  createTransaction,
  fetchTransactionsByThreeMonths,
  getTransactionByClientEmail,
  getTransactionById,
  getDailyLimit,
  getPaymentNetworks,
  getTransactionsStatsMonthly,
  sendWhatsappPaymentCard,
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
import { unwrapAction } from "@/lib/auth-errors";
import type { WhatsappCardOrigin } from "@/lib/transaction-utils";

/** Refresh home stats + transactions list after create/update. */
export function invalidateTransactionQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["transaction"] }),
    queryClient.invalidateQueries({ queryKey: ["transaction-daily-limit"] }),
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
    mutationFn: () => unwrapAction(createTransaction(data)),
    onSuccess: async () => {
      await invalidateTransactionQueries(queryClient);
    },
  });
  return { mutateAsync, isCreatingTransaction, isCreatingTransactionError };
};

/** Montant restant à envoyer aujourd'hui sur une direction (seuil journalier). */
export const useGetDailyLimit = (code: string | undefined) => {
  const { data, isLoading } = useQuery({
    queryKey: ["transaction-daily-limit", code],
    queryFn: () => unwrapAction(getDailyLimit(code!)),
    enabled: !!code,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { dailyLimit: data, isLoadingDailyLimit: isLoading };
};

export const useGetTransactonById = (id: string | undefined) => {
  const {
    isPending: isGettingTransaction,
    isError: isTransactionError,
    data: transaction,
    refetch,
  } = useQuery({
    queryKey: ["transaction", id],
    queryFn: () => unwrapAction(getTransactionById(id!)),
    enabled: !!id,
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 5,
  });
  return { transaction, isGettingTransaction, isTransactionError, refetch };
};

export const useSendWhatsappPaymentCard = () => {
  const {
    isPending: isSendingWhatsappCard,
    mutateAsync: sendWhatsappCard,
  } = useMutation({
    mutationFn: ({
      transactionId,
      origin,
      networkId,
    }: {
      transactionId: string;
      origin: WhatsappCardOrigin;
      networkId: string;
    }) =>
      unwrapAction(sendWhatsappPaymentCard(transactionId, origin, networkId)),
  });
  return { sendWhatsappCard, isSendingWhatsappCard };
};

/** Réseaux de dépôt proposés au client (ru / sen) ; `enabled` = origine WhatsApp uniquement. */
export const useGetPaymentNetworks = (
  transactionId: string | undefined,
  enabled: boolean,
) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["payment-networks", transactionId],
    queryFn: () => unwrapAction(getPaymentNetworks(transactionId!)),
    enabled: !!transactionId && enabled,
    staleTime: 1000 * 60,
  });
  return {
    paymentNetworks: data ?? [],
    isLoadingPaymentNetworks: isLoading,
    isPaymentNetworksError: isError,
  };
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
    }) =>
      unwrapAction(
        updateTransaction(transactionId, senderNumber, hour, status),
      ),
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
    queryFn: () => unwrapAction(getTransactionByClientEmail(email!, date)),
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
    queryFn: () => unwrapAction(getTransactionsStatsMonthly()),
    enabled: !!email,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
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
    queryFn: ({ pageParam }) =>
      unwrapAction(fetchTransactionsByThreeMonths(pageParam)),
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

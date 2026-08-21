"use client";

import { getAuth } from "@/app/actions/auth";
import { unwrapAction } from "@/lib/auth-errors";
import { clearAuthSession, hasAuthSession } from "@/config/cookies";
import type { IClientResponse } from "@/types/user";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

interface AuthState {
  isAuthenticated: boolean;
  user: IClientResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedCode?: string | null;
}

interface AuthContextType {
  state: AuthState;
  resetState: () => void;
  fillState: (user: IClientResponse) => void;
  setSelectedCode: (code: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(hasAuthSession);
  const [selectedCode, setSelectedCodeState] = useState<string | null>(null);

  const {
    data: user,
    isPending,
    isError,
  } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => unwrapAction(getAuth()),
    enabled: hasToken,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!isError) return;
    clearAuthSession();
    setHasToken(false);
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
  }, [isError, queryClient]);

  const resetState = useCallback(() => {
    clearAuthSession();
    setHasToken(false);
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
    setSelectedCodeState(null);
  }, [queryClient]);

  const fillState = useCallback(
    (nextUser: IClientResponse) => {
      setHasToken(true);
      queryClient.setQueryData(AUTH_QUERY_KEY, nextUser);
    },
    [queryClient],
  );

  const setSelectedCode = useCallback((code: string) => {
    setSelectedCodeState(code || null);
  }, []);

  const state = useMemo<AuthState>(() => {
    if (!hasToken) {
      return {
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null,
        selectedCode,
      };
    }

    if (isError) {
      return {
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: "Session invalide",
        selectedCode,
      };
    }

    return {
      isAuthenticated: !!user,
      user: user ?? null,
      isLoading: isPending,
      error: null,
      selectedCode,
    };
  }, [hasToken, isError, isPending, user, selectedCode]);

  const value = useMemo<AuthContextType>(
    () => ({
      state,
      resetState,
      fillState,
      setSelectedCode,
    }),
    [state, resetState, fillState, setSelectedCode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const Auth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("Auth must be used within an AuthProvider");
  }
  return context;
};

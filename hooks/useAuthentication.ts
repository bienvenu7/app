"use client";
import {
  login,
  logout,
  register,
  requestPasswordReset,
  resendOtp,
  resetPassword,
} from "@/app/actions/auth";
import { unwrapAction } from "@/lib/auth-errors";
import type { AuthIdentifier } from "@/lib/auth-identifier";
import { fetchSession, verifyOtp } from "@/lib/session-client";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useAuthentication = (
  identifier: AuthIdentifier | null,
  password: string,
) => {
  const {
    mutateAsync: postLogin,
    isPending: isLogin,
    isError: loginError,
  } = useMutation({
    mutationKey: ["login", identifier?.kind, identifier && "email" in identifier ? identifier.email : identifier?.phone],
    mutationFn: () => {
      if (!identifier) throw new Error("missing_identifier");
      return unwrapAction(login(identifier, password));
    },
  });
  return { postLogin, isLogin, loginError };
};

export const useOptCheck = (identifier: AuthIdentifier | null, newOtp: string) => {
  const {
    mutateAsync: postOtp,
    isPending: lodingOtp,
    isError: otpError,
    isSuccess: successOtp,
  } = useMutation({
    mutationKey: ["verify-otp", identifier?.kind],
    mutationFn: () => {
      if (!identifier) throw new Error("missing_identifier");
      return verifyOtp(identifier, newOtp);
    },
  });
  return { postOtp, lodingOtp, otpError, successOtp };
};

export const useResendOtp = (identifier: AuthIdentifier | null) => {
  const {
    mutateAsync: resend,
    isPending: isResending,
    isError: resendError,
  } = useMutation({
    mutationKey: [
      "resend-otp",
      identifier?.kind,
      identifier && "email" in identifier ? identifier.email : identifier?.phone,
    ],
    mutationFn: () => {
      if (!identifier) throw new Error("missing_identifier");
      return unwrapAction(resendOtp(identifier));
    },
  });
  return { resend, isResending, resendError };
};

export const useRequestPasswordReset = () => {
  const {
    mutateAsync: requestReset,
    isPending: isRequestingReset,
    isError: requestResetError,
  } = useMutation({
    mutationKey: ["forgot-password"],
    mutationFn: (email: string) => unwrapAction(requestPasswordReset(email)),
  });
  return { requestReset, isRequestingReset, requestResetError };
};

export const useResetPassword = () => {
  const {
    mutateAsync: submitReset,
    isPending: isResettingPassword,
    isError: resetPasswordError,
    isSuccess: resetPasswordSuccess,
  } = useMutation({
    mutationKey: ["reset-password"],
    mutationFn: ({
      email,
      otp,
      password,
    }: {
      email: string;
      otp: string;
      password: string;
    }) => unwrapAction(resetPassword(email, otp, password)),
  });
  return {
    submitReset,
    isResettingPassword,
    resetPasswordError,
    resetPasswordSuccess,
  };
};

export const useRegistration = (
  email: string,
  password: string,
  fullName: string,
  countryId: string,
  gender: string,
  whatsappNumber: string,
) => {
  const {
    mutateAsync: registerFn,
    isPending: isRegistering,
    isError: isRegisterError,
  } = useMutation({
    mutationKey: ["register", email],
    mutationFn: () =>
      unwrapAction(
        register(
          email,
          password,
          fullName,
          countryId,
          gender,
          whatsappNumber || undefined,
        ),
      ),
  });
  return { registerFn, isRegisterError, isRegistering };
};

export const useLogout = () => {
  const {
    mutateAsync: logoutFn,
    isPending: islogout,
    isError: isLogoutError,
  } = useMutation({
    mutationKey: ["logout"],
    mutationFn: () => unwrapAction(logout()),
  });
  return { logoutFn, isLogoutError, islogout };
};

export const useGetAuth = () => {
  const { data: user, isLoading: loadingUser } = useQuery({
    queryFn: () => fetchSession(),
    queryKey: ["userData"],
  });
  return { user, loadingUser };
};

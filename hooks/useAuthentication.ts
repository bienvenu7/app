"use client";
import {
  confirmOtp,
  getAuth,
  login,
  logout,
  register,
  resendOtp,
  updatePassword,
} from "@/app/actions/auth";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useAuthentication = (email: string, password: string) => {
  const {
    mutateAsync: postLogin,
    isPending: isLogin,
    isError: loginError,
  } = useMutation({
    mutationKey: ["login", email],
    mutationFn: () => login(email, password),
  });
  return { postLogin, isLogin, loginError };
};

export const useOptCheck = (email: string, newOtp: string) => {
  const {
    mutateAsync: postOtp,
    isPending: lodingOtp,
    isError: otpError,
    isSuccess: successOtp,
  } = useMutation({
    mutationKey: ["verify-otp", email, newOtp],
    mutationFn: () => confirmOtp(email, newOtp),
  });
  return { postOtp, lodingOtp, otpError, successOtp };
};

export const useResendOtp = (email: string) => {
  const {
    mutateAsync: resend,
    isPending: isResending,
    isError: resendError,
  } = useMutation({
    mutationKey: ["resend-otp", email],
    mutationFn: () => resendOtp(email),
  });
  return { resend, isResending, resendError };
};

export const useUpdatePassword = (email: string, password: string) => {
  const {
    mutateAsync: changeOtp,
    isPending: loadingChangeOtp,
    isError: otpChangeError,
    isSuccess: successChangeOtp,
  } = useMutation({
    mutationKey: ["update", password, email],
    mutationFn: () => updatePassword(email, password),
  });
  return { changeOtp, loadingChangeOtp, otpChangeError, successChangeOtp };
};

export const useRegistration = (
  email: string,
  password: string,
  fullName: string,
  countryId: string,
  gender: string,
) => {
  const {
    mutateAsync: registerFn,
    isPending: isRegistering,
    isError: isRegisterError,
  } = useMutation({
    mutationKey: ["register", email],
    mutationFn: () => register(email, password, fullName, countryId, gender),
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
    mutationFn: () => logout(),
  });
  return { logoutFn, isLogoutError, islogout };
};

export const useGetAuth = () => {
  const { data: user, isLoading: loadingUser } = useQuery({
    queryFn: getAuth,
    queryKey: ["userData"],
  });
  return { user, loadingUser };
};

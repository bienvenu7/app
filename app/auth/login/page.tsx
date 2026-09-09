"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PinPad } from "@/components/PinPad";
import ui from "@/components/ui.module.scss";
import styles from "@/app/auth/auth.module.scss";
import { fetchSession, verifyOtp } from "@/lib/session-client";
import {
  useAuthentication,
  useRequestPasswordReset,
  useResendOtp,
  useResetPassword,
} from "@/hooks/useAuthentication";
import { Auth } from "@/providers/AuthContext";
import { isAuthEntryRoute, isAuthUtilityRoute } from "@/lib/auth-routes";
import {
  apiErrorMessage,
  isForbiddenAuth,
  isOtpDeliveryFailed,
  isRateLimited,
  isUnauthorized,
  isValidationError,
} from "@/lib/auth-errors";
import Loading from "@/components/Loading";
import { useT } from "@/lib/i18n";
import {
  clearPinAuth,
  getPinLockRemainingMs,
  getValidPinAuth,
  getWhatsappHint,
  isPinLocked,
  isPinUnlockRequired,
  persistWhatsappHint,
  PIN_MAX_ATTEMPTS,
  recordPinFailure,
  savePinAuth,
  touchPinUnlock,
  verifySavedPin,
  type PinAuth,
} from "@/lib/storage";
import { useOtpTtl } from "@/hooks/useOtpTtl";
import type { AuthIdentifier, LoginMethod, OtpChannel } from "@/lib/auth-identifier";
import {
  LOGIN_OTP_TTL_MS,
  RESET_OTP_TTL_MS,
  WHATSAPP_PATTERN,
  otpChannelFromStoredNumber,
  sanitizeWhatsappInput,
} from "@/lib/phone-rules";

type Mode =
  | "checking"
  | "credentials"
  | "forgot-password"
  | "forgot-reset"
  | "verify-otp"
  | "create-pin"
  | "confirm-pin"
  | "pin-login";

function safeReturnPath(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  if (isAuthEntryRoute(path) || isAuthUtilityRoute(path)) return "/";
  return path;
}

function LoginFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("from"));
  const { fillState, resetState } = Auth();
  const t = useT();

  const [mode, setMode] = useState<Mode>("checking");
  const [savedAuth, setSavedAuth] = useState<PinAuth | null>(null);
  const [greetingName, setGreetingName] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Credentials
  const [loginKind, setLoginKind] = useState<LoginMethod>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Forgot password
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetOtpError, setResetOtpError] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // OTP (login)
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [pendingIdentifier, setPendingIdentifier] =
    useState<AuthIdentifier | null>(null);
  const [pendingOtpChannel, setPendingOtpChannel] =
    useState<OtpChannel>("email");
  const [pendingPinEmail, setPendingPinEmail] = useState("");
  const otpSubmittedRef = useRef<string | null>(null);

  // PIN
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null);
  const [lockTick, setLockTick] = useState(0);
  const pinSubmitRef = useRef<string | null>(null);

  const loginIdentifier: AuthIdentifier | null =
    loginKind === "email"
      ? email.trim()
        ? { kind: "email", email: email.trim() }
        : null
      : phone
        ? { kind: "phone", phone }
        : null;

  const { postLogin, isLogin } = useAuthentication(loginIdentifier, password);
  const { resend, isResending } = useResendOtp(pendingIdentifier);
  const { requestReset, isRequestingReset } = useRequestPasswordReset();
  const { submitReset, isResettingPassword } = useResetPassword();
  const {
    remaining: loginOtpRemaining,
    expired: loginOtpExpired,
    restart: restartLoginOtpTtl,
  } = useOtpTtl(mode === "verify-otp", LOGIN_OTP_TTL_MS);
  const {
    remaining: resetOtpRemaining,
    expired: resetOtpExpired,
    restart: restartResetOtpTtl,
  } = useOtpTtl(mode === "forgot-reset", RESET_OTP_TTL_MS);

  const loginOtpChannel: OtpChannel = pendingOtpChannel;
  const resetOtpChannel = otpChannelFromStoredNumber(
    getWhatsappHint(resetEmail),
    { unknownIfMissing: true },
  );

  const otpSentMessage = (channel: "whatsapp" | "email" | "unknown") =>
    channel === "whatsapp"
      ? t("auth.otpSentWhatsapp")
      : channel === "email"
        ? t("auth.otpSentEmail")
        : t("auth.otpSent");

  const otpEnterMessage = (channel: "whatsapp" | "email" | "unknown") =>
    channel === "whatsapp"
      ? t("auth.enterOtpWhatsapp")
      : channel === "email"
        ? t("auth.enterOtpEmail")
        : t("auth.enterOtpUnknown");

  useEffect(() => {
    const saved = getValidPinAuth();
    if (!saved) {
      setMode("credentials");
      return;
    }

    setSavedAuth(saved);
    if (isPinLocked(saved)) {
      setPinLockedUntil(saved.lockedUntil ?? null);
    }

    if (isPinUnlockRequired(saved)) {
      setMode("pin-login");
      return;
    }

    (async () => {
      try {
        const user = await fetchSession();
        fillState(user);
        router.replace(returnTo);
      } catch {
        setMode("pin-login");
      }
    })();
  }, [fillState, router, returnTo]);

  useEffect(() => {
    if (mode !== "pin-login" || !savedAuth) return;

    let cancelled = false;
    (async () => {
      setLoadingProfile(true);
      try {
        const user = await fetchSession();
        if (cancelled) return;
        const firstName = user.fullName?.split(" ")[0] || t("common.dearClient");
        setGreetingName(firstName);
      } catch {
        if (cancelled) return;
        clearPinAuth();
        setSavedAuth(null);
        setGreetingName(null);
        setEmail(savedAuth.email);
        setMode("credentials");
        toast.error(t("auth.sessionExpired"));
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, savedAuth]);

  const resetPinBuffers = () => {
    setPin("");
    setFirstPin("");
    setPinError(false);
    pinSubmitRef.current = null;
  };

  const pinLockActive =
    typeof pinLockedUntil === "number" && pinLockedUntil > Date.now();
  // `lockTick` forces a re-render every second while locked.
  const pinLockSeconds =
    pinLockActive && pinLockedUntil
      ? Math.max(0, Math.ceil((pinLockedUntil - Date.now()) / 1000) + lockTick * 0)
      : 0;

  useEffect(() => {
    if (!pinLockActive) return;
    const id = window.setInterval(() => {
      if (pinLockedUntil && pinLockedUntil <= Date.now()) {
        setPinLockedUntil(null);
        setLockTick(0);
        return;
      }
      setLockTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [pinLockActive, pinLockedUntil]);

  const resetOtpBuffer = () => {
    setOtp("");
    setOtpError(false);
    setOtpVerifying(false);
    otpSubmittedRef.current = null;
  };

  const handleUseAnotherAccount = () => {
    clearPinAuth();
    setSavedAuth(null);
    setGreetingName(null);
    setPinLockedUntil(null);
    resetPinBuffers();
    resetOtpBuffer();
    setMode("credentials");
  };

  const completeSessionAndGoHome = useCallback(
    async (greeting?: string) => {
      try {
        const user = await fetchSession();
        fillState(user);
      } catch {
        // Session cookies were written at verify-otp. Don't trap the user on
        // the PIN screen if get-auth flakes.
      }
      if (greeting) toast.success(greeting);
      router.replace(returnTo);
    },
    [fillState, router, returnTo],
  );

  const canRequestReset = /\S+@\S+\.\S+/.test(resetEmail.trim());

  const canConfirmReset =
    canRequestReset &&
    resetOtp.length === 6 &&
    newPassword.length >= 6 &&
    confirmNewPassword === newPassword;

  const clearForgotForm = () => {
    setResetEmail("");
    setResetOtp("");
    setResetOtpError(false);
    setNewPassword("");
    setConfirmNewPassword("");
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
  };

  const handleOpenForgotPassword = () => {
    clearForgotForm();
    setResetEmail(email.trim());
    setMode("forgot-password");
  };

  const handleBackToLogin = () => {
    clearForgotForm();
    setMode("credentials");
  };

  const handleBackToForgotEmail = () => {
    setResetOtp("");
    setResetOtpError(false);
    setNewPassword("");
    setConfirmNewPassword("");
    setMode("forgot-password");
  };

  const handleForgotPasswordSubmit = async () => {
    if (!canRequestReset) return;

    try {
      await requestReset(resetEmail.trim());
      setResetOtp("");
      setResetOtpError(false);
      setNewPassword("");
      setConfirmNewPassword("");
      setMode("forgot-reset");
      toast.success(otpSentMessage(resetOtpChannel));
    } catch (error) {
      if (isOtpDeliveryFailed(error)) {
        toast.error(apiErrorMessage(error) ?? t("auth.otpDeliveryError"));
        return;
      }
      toast.error(
        isRateLimited(error)
          ? t("auth.rateLimited")
          : t("auth.passwordResetError"),
      );
    }
  };

  const handleResendResetCode = async () => {
    if (!canRequestReset) return;
    try {
      await requestReset(resetEmail.trim());
      setResetOtp("");
      setResetOtpError(false);
      restartResetOtpTtl();
      toast.success(otpSentMessage(resetOtpChannel));
    } catch (error) {
      if (isOtpDeliveryFailed(error)) {
        toast.error(apiErrorMessage(error) ?? t("auth.otpDeliveryError"));
        return;
      }
      toast.error(
        isRateLimited(error) ? t("auth.rateLimited") : t("auth.otpResendError"),
      );
    }
  };

  const handleConfirmResetSubmit = async () => {
    if (!canConfirmReset) return;

    try {
      await submitReset({
        email: resetEmail.trim(),
        otp: resetOtp,
        password: newPassword,
      });
      clearPinAuth();
      resetState();
      setSavedAuth(null);
      setGreetingName(null);
      setEmail(resetEmail.trim());
      setPassword("");
      clearForgotForm();
      setMode("credentials");
      toast.success(t("auth.passwordUpdated"));
    } catch (error) {
      if (isForbiddenAuth(error)) {
        setResetOtpError(true);
        toast.error(t("auth.passwordResetOtpInvalid"));
        setTimeout(() => {
          setResetOtpError(false);
          setResetOtp("");
        }, 500);
        return;
      }
      if (isRateLimited(error)) {
        toast.error(t("auth.rateLimited"));
        return;
      }
      if (isValidationError(error)) {
        toast.error(t("auth.passwordResetValidation"));
        return;
      }
      toast.error(t("auth.passwordResetError"));
    }
  };

  const canSubmitLogin =
    password.length >= 1 &&
    (loginKind === "email"
      ? /\S+@\S+\.\S+/.test(email.trim())
      : WHATSAPP_PATTERN.test(phone));

  const handleLoginSubmit = async () => {
    if (!canSubmitLogin || !loginIdentifier) return;

    setVerifying(true);
    try {
      const result = await postLogin();
      setPendingIdentifier(loginIdentifier);
      setPendingOtpChannel(result.otpChannel);
      setPendingPinEmail(
        loginIdentifier.kind === "email" ? loginIdentifier.email : "",
      );
      resetOtpBuffer();
      resetPinBuffers();
      setMode("verify-otp");
      toast.success(otpSentMessage(result.otpChannel));
    } catch (error) {
      if (isOtpDeliveryFailed(error)) {
        toast.error(apiErrorMessage(error) ?? t("auth.otpDeliveryError"));
        return;
      }
      toast.error(
        isRateLimited(error) ? t("auth.rateLimited") : t("auth.badCredentials"),
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingIdentifier) return;
    try {
      await resend();
      resetOtpBuffer();
      restartLoginOtpTtl();
      toast.success(otpSentMessage(loginOtpChannel));
    } catch {
      toast.error(t("auth.otpResendError"));
    }
  };

  // OTP — auto-submit once at 6 digits
  useEffect(() => {
    if (mode !== "verify-otp" || otp.length !== 6) return;
    if (otpSubmittedRef.current === otp) return;

    otpSubmittedRef.current = otp;
    setOtpVerifying(true);

    (async () => {
      try {
        if (!pendingIdentifier) return;
        const result = await verifyOtp(pendingIdentifier, otp);
        if (result?.user) {
          persistWhatsappHint(result.user.email, result.user.whatsappNumber);
          fillState(result.user);
          if (result.user.email) setPendingPinEmail(result.user.email);
        }
        resetOtpBuffer();
        resetPinBuffers();
        setMode("create-pin");
        toast.success(t("auth.otpVerified"));
      } catch (error) {
        // Keep otpSubmittedRef === otp until the pad is cleared, otherwise
        // setting otpVerifying back to false re-triggers this effect in a loop.
        setOtpVerifying(false);
        setOtpError(true);
        toast.error(
          isUnauthorized(error)
            ? t("auth.otpIncorrect")
            : t("auth.sessionLoadError"),
        );
        setTimeout(() => {
          setOtpError(false);
          setOtp("");
          otpSubmittedRef.current = null;
        }, 500);
      }
    })();
  }, [otp, mode, pendingIdentifier, fillState, t]);

  // PIN creation — step 1
  useEffect(() => {
    if (mode !== "create-pin" || pin.length !== 5) return;
    const timeoutId = setTimeout(() => {
      setFirstPin(pin);
      setPin("");
      setMode("confirm-pin");
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [pin, mode]);

  // PIN creation — confirmation
  useEffect(() => {
    if (mode !== "confirm-pin" || pin.length !== 5) return;

    if (pin === firstPin) {
      let cancelled = false;
      (async () => {
        const now = Date.now();
        try {
          const pinEmail =
            pendingPinEmail ||
            (pendingIdentifier?.kind === "email"
              ? pendingIdentifier.email
              : "");
          await savePinAuth({
            email: pinEmail,
            pin,
            createdAt: now,
            lastUnlockAt: now,
          });
          if (cancelled) return;
          await completeSessionAndGoHome(t("auth.pinCreated"));
        } catch {
          if (cancelled) return;
          toast.error(t("auth.sessionLoadError"));
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setPinError(true);
    const timeoutId = setTimeout(() => {
      setPinError(false);
      setPin("");
      setFirstPin("");
      setMode("create-pin");
      toast.error(t("auth.pinsMismatch"));
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [pin, mode, firstPin, pendingPinEmail, pendingIdentifier, completeSessionAndGoHome, t]);

  // Returning user — PIN unlock
  useEffect(() => {
    if (mode !== "pin-login" || pin.length !== 5 || !savedAuth) return;
    if (pinSubmitRef.current === pin) return;
    if (pinLockActive) {
      setPin("");
      return;
    }

    pinSubmitRef.current = pin;
    let cancelled = false;

    (async () => {
      const current = getValidPinAuth() ?? savedAuth;
      if (isPinLocked(current)) {
        setPinLockedUntil(current.lockedUntil ?? null);
        setSavedAuth(current);
        setPin("");
        pinSubmitRef.current = null;
        toast.error(
          t("auth.pinLocked", {
            seconds: String(Math.ceil(getPinLockRemainingMs(current) / 1000)),
          }),
        );
        return;
      }

      const ok = await verifySavedPin(pin, current);
      if (cancelled) return;

      if (!ok) {
        const updated = recordPinFailure(current);
        setSavedAuth(updated);
        setPinError(true);
        if (isPinLocked(updated)) {
          setPinLockedUntil(updated.lockedUntil ?? null);
          toast.error(
            t("auth.pinLocked", {
              seconds: String(
                Math.ceil(getPinLockRemainingMs(updated) / 1000),
              ),
            }),
          );
        } else {
          const left = PIN_MAX_ATTEMPTS - (updated.failedAttempts ?? 0);
          toast.error(t("auth.pinIncorrect", { left: String(left) }));
        }
        setTimeout(() => {
          if (cancelled) return;
          setPinError(false);
          setPin("");
          pinSubmitRef.current = null;
        }, 500);
        return;
      }

      try {
        touchPinUnlock(current);
        setPinLockedUntil(null);
        const greeting = greetingName
          ? t("auth.welcomeBackToast", { name: greetingName })
          : undefined;
        await completeSessionAndGoHome(greeting);
      } catch {
        if (cancelled) return;
        toast.error(t("auth.sessionExpired"));
        setEmail(savedAuth.email);
        clearPinAuth();
        setSavedAuth(null);
        setGreetingName(null);
        setPinLockedUntil(null);
        resetPinBuffers();
        setMode("credentials");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pin,
    mode,
    savedAuth,
    greetingName,
    completeSessionAndGoHome,
    pinLockActive,
    t,
  ]);

  const variants = {
    enter: { opacity: 0, y: 8 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  if (mode === "checking") return null;

  return (
    <div>
      <div className={styles.brandRow}>
        <Brand size="auth" />
        <LanguageSwitcher compact />
      </div>

      <AnimatePresence mode="wait">
        {mode === "credentials" && (
          <motion.div
            key="credentials"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            <div className={styles.header}>
              <h1 className={styles.title}>
                {t("auth.welcomeBack")} <em>{t("auth.welcomeBackEm")}</em>
              </h1>
              <p className={styles.subtitle}>{t("auth.loginSubtitle")}</p>
            </div>

            <div className={styles.modeToggle} role="tablist" aria-label={t("auth.loginMethod")}>
              <button
                type="button"
                role="tab"
                aria-selected={loginKind === "email"}
                className={`${styles.modeBtn} ${loginKind === "email" ? styles.selected : ""}`}
                onClick={() => setLoginKind("email")}
              >
                {t("auth.loginByEmail")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginKind === "phone"}
                className={`${styles.modeBtn} ${loginKind === "phone" ? styles.selected : ""}`}
                onClick={() => setLoginKind("phone")}
              >
                {t("auth.loginByPhone")}
              </button>
            </div>

            <div className={styles.form}>
              {loginKind === "email" ? (
                <div>
                  <span className={styles.label}>{t("common.email")}</span>
                  <input
                    className={styles.input}
                    type="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label={t("common.email")}
                    autoFocus
                  />
                </div>
              ) : (
                <div>
                  <span className={styles.label}>{t("common.phone")}</span>
                  <input
                    className={styles.input}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={15}
                    placeholder={t("auth.whatsappPlaceholder")}
                    value={phone}
                    onChange={(e) =>
                      setPhone(sanitizeWhatsappInput(e.target.value))
                    }
                    aria-label={t("common.phone")}
                    autoFocus
                  />
                </div>
              )}

              <div className={styles.passwordField}>
                <span className={styles.label}>{t("common.password")}</span>
                <input
                  className={styles.input}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label={t("common.password")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLoginSubmit();
                  }}
                />
                <button
                  type="button"
                  className={styles.toggleVisibility}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? t("common.hidePassword")
                      : t("common.showPassword")
                  }
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </div>

              <p className={styles.forgotPassword}>
                <button type="button" onClick={handleOpenForgotPassword}>
                  {t("auth.forgotPassword")}
                </button>
              </p>
            </div>

            <button
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={handleLoginSubmit}
              disabled={!canSubmitLogin || isLogin || verifying}
              style={{ marginTop: 26 }}
            >
              {isLogin || verifying ? t("auth.loggingIn") : t("auth.login")}
            </button>

            <p className={styles.footerLink}>
              {t("auth.noAccount")}{" "}
              <button
                type="button"
                onClick={() => router.push("/auth/register")}
              >
                {t("auth.signUp")}
              </button>
            </p>
          </motion.div>
        )}

        {mode === "forgot-password" && (
          <motion.div
            key="forgot-password"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            <div className={styles.header}>
              <h1 className={styles.title}>
                {t("auth.forgotTitle")} <em>{t("auth.forgotTitleEm")}</em>
              </h1>
              <p className={styles.subtitle}>{t("auth.forgotSubtitle")}</p>
            </div>

            <div className={styles.form}>
              <div>
                <span className={styles.label}>{t("common.email")}</span>
                <input
                  className={styles.input}
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  aria-label={t("common.email")}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleForgotPasswordSubmit();
                  }}
                />
              </div>
            </div>

            <div className={styles.stepFooter} style={{ marginTop: 26 }}>
              <button
                className={ui.back}
                onClick={handleBackToLogin}
                aria-label={t("common.back")}
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <button
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={handleForgotPasswordSubmit}
                disabled={!canRequestReset || isRequestingReset}
              >
                {isRequestingReset
                  ? t("auth.sendingResetCode")
                  : t("auth.sendResetCode")}
              </button>
            </div>
          </motion.div>
        )}

        {mode === "forgot-reset" && (
          <motion.div
            key="forgot-reset"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            <div className={styles.header}>
              <h1 className={styles.title}>
                {t("auth.forgotResetTitle")}{" "}
                <em>{t("auth.forgotResetTitleEm")}</em>
              </h1>
              <p className={styles.subtitle}>
                {resetOtpChannel === "whatsapp"
                  ? t("auth.forgotResetSubtitleWhatsapp")
                  : resetOtpChannel === "email"
                    ? t("auth.forgotResetSubtitleEmail")
                    : t("auth.forgotResetSubtitleUnknown")}
                <br />
                <span className={styles.otpEmail}>{resetEmail.trim()}</span>
              </p>
            </div>

            <div className={styles.form}>
              <div>
                <span className={styles.label}>{t("auth.resetCodeLabel")}</span>
                <PinPad
                  length={6}
                  value={resetOtp}
                  onChange={setResetOtp}
                  error={resetOtpError}
                  disabled={isResettingPassword}
                />
                <p className={styles.otpHint}>
                  {resetOtpExpired
                    ? t("auth.otpExpired")
                    : t("auth.otpExpiresIn", {
                        seconds: String(resetOtpRemaining),
                      })}
                </p>
                <p className={styles.resendOtp}>
                  {t("auth.noCodeReceived")}{" "}
                  <button
                    type="button"
                    onClick={handleResendResetCode}
                    disabled={isRequestingReset || isResettingPassword}
                  >
                    {isRequestingReset ? t("auth.sending") : t("auth.resend")}
                  </button>
                </p>
              </div>

              <div className={styles.passwordField}>
                <span className={styles.label}>{t("auth.newPassword")}</span>
                <input
                  className={styles.input}
                  type={showNewPassword ? "text" : "password"}
                  placeholder={t("auth.minChars")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-label={t("auth.newPassword")}
                />
                <button
                  type="button"
                  className={styles.toggleVisibility}
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={
                    showNewPassword
                      ? t("common.hidePassword")
                      : t("common.showPassword")
                  }
                >
                  {showNewPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className={styles.passwordField}>
                <span className={styles.label}>{t("common.confirm")}</span>
                <input
                  className={styles.input}
                  type={showConfirmNewPassword ? "text" : "password"}
                  placeholder={t("auth.retypePassword")}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  aria-label={t("common.confirm")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmResetSubmit();
                  }}
                />
                <button
                  type="button"
                  className={styles.toggleVisibility}
                  onClick={() => setShowConfirmNewPassword((v) => !v)}
                  aria-label={
                    showConfirmNewPassword
                      ? t("common.hidePassword")
                      : t("common.showPassword")
                  }
                >
                  {showConfirmNewPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
                {confirmNewPassword.length > 0 &&
                  confirmNewPassword !== newPassword && (
                    <p className={styles.hint}>
                      {t("auth.passwordsMismatch")}
                    </p>
                  )}
              </div>
            </div>

            <div className={styles.stepFooter} style={{ marginTop: 26 }}>
              <button
                className={ui.back}
                onClick={handleBackToForgotEmail}
                aria-label={t("common.back")}
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <button
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={handleConfirmResetSubmit}
                disabled={!canConfirmReset || isResettingPassword}
              >
                {isResettingPassword ? t("auth.updating") : t("auth.reset")}
              </button>
            </div>
          </motion.div>
        )}

        {mode === "verify-otp" && (
          <motion.div
            key="verify-otp"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            <div className={styles.pinHeader}>
              <h1 className={styles.title}>
                {t("auth.verifyCode")} <em>{t("auth.verifyCodeEm")}</em>
              </h1>
              <p className={styles.subtitle}>{otpEnterMessage(loginOtpChannel)}</p>
            </div>

            <PinPad
              length={6}
              value={otp}
              onChange={setOtp}
              error={otpError}
              disabled={otpVerifying}
            />

            <p className={styles.otpHint}>
              {loginOtpExpired
                ? t("auth.otpExpired")
                : t("auth.otpExpiresIn", {
                    seconds: String(loginOtpRemaining),
                  })}
            </p>

            <p className={styles.resendOtp}>
              {t("auth.noCodeReceived")}{" "}
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isResending || otpVerifying}
              >
                {isResending ? t("auth.sending") : t("auth.resend")}
              </button>
            </p>
          </motion.div>
        )}

        {(mode === "create-pin" || mode === "confirm-pin") && (
          <motion.div
            key="pin-create"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            <div className={styles.pinHeader}>
              <h1 className={styles.title}>
                {mode === "create-pin" ? (
                  <>
                    {t("auth.createCode")} <em>{t("auth.createCodeEm")}</em>
                  </>
                ) : (
                  <>
                    {t("auth.confirmCode")} <em>{t("auth.confirmCodeEm")}</em>
                  </>
                )}
              </h1>
              <p className={styles.subtitle}>
                {mode === "create-pin"
                  ? t("auth.createPinSubtitle")
                  : t("auth.confirmPinSubtitle")}
              </p>
            </div>

            <PinPad length={5} value={pin} onChange={setPin} error={pinError} />
          </motion.div>
        )}

        {mode === "pin-login" && savedAuth && (
          <motion.div
            key="pin-login"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            <div className={styles.pinHeader}>
              <h1 className={styles.title}>
                {loadingProfile ? (
                  <>
                    {t("auth.welcomeBack")} <em>{t("auth.welcomeBackEm")}</em>
                  </>
                ) : (
                  <>
                    {t("auth.welcomeBackName")}{" "}
                    <em>{greetingName || t("common.dearClient")}</em>
                    <span className={styles.greetingWave} aria-hidden="true">
                      👋
                    </span>
                  </>
                )}
              </h1>
              <p className={styles.subtitle}>
                {pinLockActive
                  ? t("auth.pinLockedSubtitle", {
                      seconds: String(pinLockSeconds),
                    })
                  : t("auth.pinExpiredSubtitle")}
              </p>
            </div>

            <PinPad
              length={5}
              value={pin}
              onChange={setPin}
              error={pinError}
              disabled={loadingProfile || pinLockActive}
            />

            <div className={styles.switchAccount}>
              <button type="button" onClick={handleUseAnotherAccount}>
                {t("auth.useAnotherAccount")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginFlow />
    </Suspense>
  );
}

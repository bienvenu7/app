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
import { confirmOtp, getAuth } from "@/app/actions/auth";
import {
  useAuthentication,
  useResendOtp,
  useUpdatePassword,
} from "@/hooks/useAuthentication";
import { Auth } from "@/providers/AuthContext";
import { isAuthEntryRoute } from "@/lib/auth-routes";
import Loading from "@/components/Loading";
import { useT } from "@/lib/i18n";
import {
  clearPinAuth,
  getValidPinAuth,
  isPinUnlockRequired,
  savePinAuth,
  touchPinUnlock,
  type PinAuth,
} from "@/lib/storage";

type Mode =
  | "checking"
  | "credentials"
  | "forgot-password"
  | "verify-otp"
  | "create-pin"
  | "confirm-pin"
  | "pin-login";

function safeReturnPath(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  if (isAuthEntryRoute(path)) return "/";
  return path;
}

function LoginFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("from"));
  const { fillState } = Auth();
  const t = useT();

  const [mode, setMode] = useState<Mode>("checking");
  const [savedAuth, setSavedAuth] = useState<PinAuth | null>(null);
  const [greetingName, setGreetingName] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Forgot password
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // OTP
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const otpSubmittedRef = useRef<string | null>(null);

  // PIN
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const { postLogin, isLogin } = useAuthentication(email.trim(), password);
  const { resend, isResending } = useResendOtp(pendingEmail);
  const { changeOtp: submitPasswordReset, loadingChangeOtp: isResettingPassword } =
    useUpdatePassword(resetEmail.trim(), newPassword);

  useEffect(() => {
    const saved = getValidPinAuth();
    if (!saved) {
      setMode("credentials");
      return;
    }

    setSavedAuth(saved);

    if (isPinUnlockRequired(saved)) {
      setMode("pin-login");
      return;
    }

    (async () => {
      try {
        const user = await getAuth();
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
        const user = await getAuth();
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
  };

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
    resetPinBuffers();
    resetOtpBuffer();
    setMode("credentials");
  };

  const completeSessionAndGoHome = useCallback(
    async (greeting?: string) => {
      const user = await getAuth();
      fillState(user);
      if (greeting) toast.success(greeting);
      router.replace(returnTo);
    },
    [fillState, router, returnTo],
  );

  const canResetPassword =
    /\S+@\S+\.\S+/.test(resetEmail.trim()) &&
    newPassword.length >= 6 &&
    confirmNewPassword === newPassword;

  const handleOpenForgotPassword = () => {
    setResetEmail(email.trim());
    setNewPassword("");
    setConfirmNewPassword("");
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setMode("forgot-password");
  };

  const handleBackToLogin = () => {
    setResetEmail("");
    setNewPassword("");
    setConfirmNewPassword("");
    setMode("credentials");
  };

  const handleForgotPasswordSubmit = async () => {
    if (!canResetPassword) return;

    try {
      await submitPasswordReset();
      setEmail(resetEmail.trim());
      setPassword("");
      setResetEmail("");
      setNewPassword("");
      setConfirmNewPassword("");
      setMode("credentials");
      toast.success(t("auth.passwordUpdated"));
    } catch {
      toast.error(t("auth.passwordResetError"));
    }
  };

  const handleLoginSubmit = async () => {
    if (!/\S+@\S+\.\S+/.test(email.trim()) || password.length < 1) return;

    setVerifying(true);
    try {
      await postLogin();
      setPendingEmail(email.trim());
      resetOtpBuffer();
      resetPinBuffers();
      setMode("verify-otp");
      toast.success(t("auth.otpSent"));
    } catch {
      toast.error(t("auth.badCredentials"));
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingEmail) return;
    try {
      await resend();
      resetOtpBuffer();
      toast.success(t("auth.otpResent"));
    } catch {
      toast.error(t("auth.otpResendError"));
    }
  };

  // OTP — auto-submit once at 6 digits
  useEffect(() => {
    if (mode !== "verify-otp" || otp.length !== 6 || otpVerifying) return;
    if (otpSubmittedRef.current === otp) return;

    otpSubmittedRef.current = otp;
    setOtpVerifying(true);

    (async () => {
      try {
        await confirmOtp(pendingEmail, otp);
        resetOtpBuffer();
        resetPinBuffers();
        setMode("create-pin");
        toast.success(t("auth.otpVerified"));
      } catch {
        // Allow retry only if this OTP hasn't already succeeded elsewhere
        if (otpSubmittedRef.current !== otp) return;
        otpSubmittedRef.current = null;
        setOtpVerifying(false);
        setOtpError(true);
        toast.error(t("auth.otpIncorrect"));
        setTimeout(() => {
          setOtpError(false);
          setOtp("");
        }, 500);
      }
    })();
  }, [otp, mode, otpVerifying, pendingEmail]);

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
        savePinAuth({
          email: pendingEmail,
          pin,
          createdAt: now,
          lastUnlockAt: now,
        });
        try {
          await completeSessionAndGoHome(
            t("auth.pinCreated"),
          );
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
  }, [pin, mode, firstPin, pendingEmail, completeSessionAndGoHome, t]);

  // Returning user — PIN unlock
  useEffect(() => {
    if (mode !== "pin-login" || pin.length !== 5 || !savedAuth) return;

    if (pin !== savedAuth.pin) {
      setPinError(true);
      const timeoutId = setTimeout(() => {
        setPinError(false);
        setPin("");
      }, 500);
      return () => clearTimeout(timeoutId);
    }

    let cancelled = false;
    (async () => {
      try {
        touchPinUnlock(savedAuth);
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
        resetPinBuffers();
        setMode("credentials");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pin, mode, savedAuth, greetingName, completeSessionAndGoHome]);

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

            <div className={styles.form}>
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
              disabled={
                !/\S+@\S+\.\S+/.test(email.trim()) ||
                password.length < 1 ||
                isLogin ||
                verifying
              }
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
                />
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
                    if (e.key === "Enter") handleForgotPasswordSubmit();
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
                onClick={handleBackToLogin}
                aria-label={t("common.back")}
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <button
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={handleForgotPasswordSubmit}
                disabled={!canResetPassword || isResettingPassword}
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
              <p className={styles.subtitle}>
                {t("auth.enterOtpSentTo")}{" "}
                <span className={styles.otpEmail}>{pendingEmail}</span>
              </p>
            </div>

            <PinPad
              length={6}
              value={otp}
              onChange={setOtp}
              error={otpError}
              disabled={otpVerifying}
            />

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
              <p className={styles.subtitle}>{t("auth.pinExpiredSubtitle")}</p>
            </div>

            <PinPad
              length={5}
              value={pin}
              onChange={setPin}
              error={pinError}
              disabled={loadingProfile}
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

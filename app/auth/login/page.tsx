"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
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
        const firstName = user.fullName?.split(" ")[0] || "cher client";
        setGreetingName(firstName);
      } catch {
        if (cancelled) return;
        clearPinAuth();
        setSavedAuth(null);
        setGreetingName(null);
        setEmail(savedAuth.email);
        setMode("credentials");
        toast.error("Votre session a expiré, veuillez vous reconnecter.");
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
      toast.success("Votre mot de passe a été mis à jour. Connectez-vous.");
    } catch {
      toast.error("Impossible de réinitialiser le mot de passe.");
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
      toast.success("Un code à 6 chiffres vous a été envoyé par email.");
    } catch {
      toast.error("Email ou mot de passe incorrect.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingEmail) return;
    try {
      await resend();
      resetOtpBuffer();
      toast.success("Un nouveau code a été envoyé.");
    } catch {
      toast.error("Impossible de renvoyer le code.");
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
        toast.success("Code vérifié !");
      } catch {
        // Allow retry only if this OTP hasn't already succeeded elsewhere
        if (otpSubmittedRef.current !== otp) return;
        otpSubmittedRef.current = null;
        setOtpVerifying(false);
        setOtpError(true);
        toast.error("Code incorrect, réessayez.");
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
    const t = setTimeout(() => {
      setFirstPin(pin);
      setPin("");
      setMode("confirm-pin");
    }, 150);
    return () => clearTimeout(t);
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
            "Votre code a été créé avec succès !",
          );
        } catch {
          if (cancelled) return;
          toast.error("Impossible de charger votre session.");
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setPinError(true);
    const t = setTimeout(() => {
      setPinError(false);
      setPin("");
      setFirstPin("");
      setMode("create-pin");
      toast.error("Les codes ne correspondent pas, réessayez.");
    }, 500);
    return () => clearTimeout(t);
  }, [pin, mode, firstPin, pendingEmail, completeSessionAndGoHome]);

  // Returning user — PIN unlock
  useEffect(() => {
    if (mode !== "pin-login" || pin.length !== 5 || !savedAuth) return;

    if (pin !== savedAuth.pin) {
      setPinError(true);
      const t = setTimeout(() => {
        setPinError(false);
        setPin("");
      }, 500);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    (async () => {
      try {
        touchPinUnlock(savedAuth);
        const greeting = greetingName
          ? `Bon retour, ${greetingName} 👋`
          : undefined;
        await completeSessionAndGoHome(greeting);
      } catch {
        if (cancelled) return;
        toast.error("Votre session a expiré, veuillez vous reconnecter.");
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
                Bon <em>retour</em>
              </h1>
              <p className={styles.subtitle}>Connectez-vous à votre compte.</p>
            </div>

            <div className={styles.form}>
              <div>
                <span className={styles.label}>Email</span>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email"
                  autoFocus
                />
              </div>

              <div className={styles.passwordField}>
                <span className={styles.label}>Mot de passe</span>
                <input
                  className={styles.input}
                  type={showPassword ? "text" : "password"}
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Mot de passe"
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
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
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
                  Mot de passe oublié ?
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
              {isLogin || verifying ? "Connexion..." : "Se connecter"}
            </button>

            <p className={styles.footerLink}>
              Pas encore de compte ?{" "}
              <button
                type="button"
                onClick={() => router.push("/auth/register")}
              >
                S&apos;inscrire
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
                Mot de passe <em>oublié</em>
              </h1>
              <p className={styles.subtitle}>
                Entrez votre email et choisissez un nouveau mot de passe.
              </p>
            </div>

            <div className={styles.form}>
              <div>
                <span className={styles.label}>Email</span>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="vous@exemple.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  aria-label="Email"
                  autoFocus
                />
              </div>

              <div className={styles.passwordField}>
                <span className={styles.label}>Nouveau mot de passe</span>
                <input
                  className={styles.input}
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Au moins 6 caractères"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-label="Nouveau mot de passe"
                />
                <button
                  type="button"
                  className={styles.toggleVisibility}
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={
                    showNewPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
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
                <span className={styles.label}>Confirmer</span>
                <input
                  className={styles.input}
                  type={showConfirmNewPassword ? "text" : "password"}
                  placeholder="Retapez votre mot de passe"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  aria-label="Confirmer le mot de passe"
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
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
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
                      Les mots de passe ne correspondent pas.
                    </p>
                  )}
              </div>
            </div>

            <div className={styles.stepFooter} style={{ marginTop: 26 }}>
              <button
                className={ui.back}
                onClick={handleBackToLogin}
                aria-label="Retour"
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <button
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={handleForgotPasswordSubmit}
                disabled={!canResetPassword || isResettingPassword}
              >
                {isResettingPassword ? "Mise à jour..." : "Réinitialiser"}
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
                Vérifiez votre <em>code</em>
              </h1>
              <p className={styles.subtitle}>
                Entrez le code à 6 chiffres envoyé à{" "}
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
              Vous n&apos;avez pas reçu le code ?{" "}
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isResending || otpVerifying}
              >
                {isResending ? "Envoi..." : "Renvoyer"}
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
                    Créez votre <em>code</em>
                  </>
                ) : (
                  <>
                    Confirmez votre <em>code</em>
                  </>
                )}
              </h1>
              <p className={styles.subtitle}>
                {mode === "create-pin"
                  ? "Choisissez un code à 5 chiffres pour vos prochaines connexions."
                  : "Ressaisissez le même code pour le confirmer."}
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
                    Bon <em>retour</em>
                  </>
                ) : (
                  <>
                    Bon retour, <em>{greetingName || "cher client"}</em>
                    <span className={styles.greetingWave} aria-hidden="true">
                      👋
                    </span>
                  </>
                )}
              </h1>
              <p className={styles.subtitle}>
                Votre session a expiré. Entrez votre code à 5 chiffres pour
                continuer.
              </p>
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
                Se connecter avec un autre compte
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

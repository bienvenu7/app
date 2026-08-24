"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PinPad } from "@/components/PinPad";
import ui from "@/components/ui.module.scss";
import styles from "@/app/auth/auth.module.scss";
import { getAuth } from "@/app/actions/auth";
import { isUnauthorized, unwrapAction } from "@/lib/auth-errors";
import { verifyOtpSession } from "@/lib/verify-otp-session";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { otpAttemptsExhausted } from "@/lib/otp-attempts";
import { useGetCountries } from "@/hooks/useCountry";
import { useRegistration, useResendOtp } from "@/hooks/useAuthentication";
import { countryFlagEmoji } from "@/lib/flags";
import { savePinAuth } from "@/lib/storage";
import { Auth } from "@/providers/AuthContext";
import type { ICountry } from "@/types/country";
import { useT } from "@/lib/i18n";

const TOTAL_STEPS = 5;

export default function RegisterPage() {
  const router = useRouter();
  const { fillState } = Auth();
  const t = useT();
  const { countries, isLoading: loadingCountries } = useGetCountries();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  // Step 1 — personal info
  const [countryId, setCountryId] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"Masculin" | "Féminin" | "">("");

  // Step 2 — credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 3 — OTP
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpFailures, setOtpFailures] = useState(0);
  const otpSubmittedRef = useRef<string | null>(null);

  // Steps 4–5 — PIN
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedCountry = useMemo(
    () => (countries as ICountry[])?.find((c) => c.id === countryId),
    [countries, countryId],
  );

  const filteredCountries = useMemo(() => {
    const list = (countries as ICountry[]) ?? [];
    if (!countrySearch.trim()) return list;
    const q = countrySearch.trim().toLowerCase();
    return list.filter((c) => c.pubicName?.toLowerCase().includes(q));
  }, [countries, countrySearch]);

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const { registerFn, isRegistering } = useRegistration(
    email.trim(),
    password,
    fullName,
    countryId,
    gender,
  );
  const { resend, isResending } = useResendOtp(email.trim());
  const registerCooldown = useRateLimitCooldown();
  const otpResendCooldown = useRateLimitCooldown();
  const otpLocked = otpAttemptsExhausted(otpFailures);

  const resetOtpBuffer = useCallback(() => {
    setOtp("");
    setOtpError(false);
    setOtpVerifying(false);
    setOtpFailures(0);
    otpSubmittedRef.current = null;
  }, []);

  const resetPinBuffers = useCallback(() => {
    setPin("");
    setFirstPin("");
    setPinError(false);
  }, []);

  const completeSessionAndGoHome = useCallback(
    async (message?: string) => {
      const user = await unwrapAction(getAuth());
      fillState(user);
      toast.success(message ?? t("auth.accountCreated"));
      router.replace("/");
    },
    [fillState, router],
  );

  const canNextStep0 = !!countryId && !!firstName.trim() && !!lastName.trim() && !!gender;
  const canNextStep1 =
    /\S+@\S+\.\S+/.test(email.trim()) &&
    password.length >= 6 &&
    confirmPassword === password;

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const handleBack = () => {
    if (step === 0) {
      router.push("/auth/login");
      return;
    }
    if (step === 2) {
      resetOtpBuffer();
    }
    go(step - 1);
  };

  const handleResendOtp = async () => {
    if (!email.trim() || otpResendCooldown.locked) return;
    try {
      await resend();
      resetOtpBuffer();
      toast.success(t("auth.otpResent"));
    } catch (error) {
      const wait = otpResendCooldown.capture(error);
      if (wait != null) {
        toast.error(
          t("auth.rateLimitedCountdown", { seconds: String(wait) }),
        );
        return;
      }
      toast.error(t("auth.otpResendError"));
    }
  };

  const handleSubmit = async () => {
    if (step === 0) {
      if (!canNextStep0) return;
      go(1);
      return;
    }

    if (step !== 1) return;
    if (!canNextStep1) return;
    if (registerCooldown.locked) return;

    try {
      await registerFn();
      resetOtpBuffer();
      otpResendCooldown.clear();
      go(2);
      toast.success(t("auth.otpSent"));
    } catch (error) {
      const wait = registerCooldown.capture(error);
      if (wait != null) {
        toast.error(
          t("auth.rateLimitedCountdown", { seconds: String(wait) }),
        );
        return;
      }
      toast.error(t("auth.registerError"));
    }
  };

  useEffect(() => {
    if (step !== 2 || otp.length !== 6) return;
    if (otpSubmittedRef.current === otp) return;
    if (otpLocked) return;

    otpSubmittedRef.current = otp;
    setOtpVerifying(true);
    let cancelled = false;

    (async () => {
      try {
        await verifyOtpSession(email.trim(), otp);
        if (cancelled) return;
        resetOtpBuffer();
        resetPinBuffers();
        go(3);
        toast.success(t("auth.otpVerified"));
      } catch (error) {
        if (cancelled) return;
        // Keep otpSubmittedRef === otp until the pad is cleared, otherwise
        // setting otpVerifying back to false re-triggers this effect in a loop.
        setOtpVerifying(false);
        const wait = otpResendCooldown.capture(error);
        if (wait != null) {
          setOtpError(true);
          toast.error(
            t("auth.rateLimitedCountdown", { seconds: String(wait) }),
          );
        } else if (isUnauthorized(error)) {
          setOtpError(true);
          const next = otpFailures + 1;
          setOtpFailures(next);
          toast.error(
            otpAttemptsExhausted(next)
              ? t("auth.otpExhausted")
              : t("auth.otpIncorrect"),
          );
        } else {
          toast.error(t("auth.sessionLoadError"));
        }
        setTimeout(() => {
          if (cancelled) return;
          setOtpError(false);
          setOtp("");
          otpSubmittedRef.current = null;
        }, 500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    otp,
    step,
    email,
    otpLocked,
    otpFailures,
    otpResendCooldown.capture,
    resetOtpBuffer,
    resetPinBuffers,
    t,
  ]);

  useEffect(() => {
    if (step !== 3 || pin.length !== 5) return;
    const timeoutId = setTimeout(() => {
      setFirstPin(pin);
      setPin("");
      go(4);
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [pin, step]);

  useEffect(() => {
    if (step !== 4 || pin.length !== 5) return;

    if (pin === firstPin) {
      let cancelled = false;
      (async () => {
        const now = Date.now();
        try {
          await savePinAuth({
            email: email.trim(),
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
      go(3);
      toast.error(t("auth.pinsMismatch"));
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [pin, step, firstPin, email, completeSessionAndGoHome, t]);

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div>
      <div className={styles.brandRow}>
        <Brand size="auth" />
        <LanguageSwitcher compact />
      </div>

      <div className={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={styles.progressStep}>
            <motion.span
              initial={false}
              animate={{ width: i <= step ? "100%" : "0%" }}
              transition={{ duration: 0.3 }}
            />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {step === 0 && (
            <>
              <div className={styles.header}>
                <h1 className={styles.title}>
                  {t("auth.yourInfo")} <em>{t("auth.yourInfoEm")}</em>
                </h1>
                <p className={styles.subtitle}>{t("auth.infoSubtitle")}</p>
              </div>

              <div className={styles.form}>
                <div className={styles.selectField} ref={selectRef}>
                  <span className={styles.label}>{t("common.country")}</span>
                  <button
                    type="button"
                    className={`${styles.selectTrigger} ${countryOpen ? styles.open : ""}`}
                    onClick={() => setCountryOpen((o) => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={countryOpen}
                  >
                    <span className={styles.flag} aria-hidden="true">
                      {countryFlagEmoji(selectedCountry?.pubicName)}
                    </span>
                    <span
                      className={`${styles.selVal} ${!selectedCountry ? styles.selPlaceholder : ""}`}
                    >
                      {loadingCountries
                        ? t("common.loading")
                        : (selectedCountry?.pubicName ?? t("common.selectCountry"))}
                    </span>
                    <span className={styles.chev}>
                      <ChevronDown aria-hidden="true" />
                    </span>
                  </button>

                  {countryOpen && (
                    <div className={styles.selectMenu} role="listbox">
                      <input
                        className={styles.selectSearch}
                        placeholder={t("common.searchCountry")}
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        autoFocus
                      />
                      {filteredCountries.length === 0 && (
                        <div className={styles.selectEmpty}>
                          {t("common.noCountryFound")}
                        </div>
                      )}
                      {filteredCountries.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`${styles.selectOption} ${c.id === countryId ? styles.selected : ""}`}
                          onClick={() => {
                            setCountryId(c.id);
                            setCountryOpen(false);
                            setCountrySearch("");
                          }}
                          role="option"
                          aria-selected={c.id === countryId}
                        >
                          <span className={styles.flag} aria-hidden="true">
                            {countryFlagEmoji(c.pubicName)}
                          </span>
                          <span>{c.pubicName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className={styles.label}>{t("common.firstName")}</span>
                  <input
                    className={styles.input}
                    placeholder="Amadou"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    aria-label={t("common.firstName")}
                  />
                </div>

                <div>
                  <span className={styles.label}>{t("common.lastName")}</span>
                  <input
                    className={styles.input}
                    placeholder="Diallo"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-label={t("common.lastName")}
                  />
                </div>

                <div>
                  <span className={styles.label}>{t("auth.gender")}</span>
                  <div className={styles.genderRow}>
                    <button
                      type="button"
                      className={`${styles.genderBtn} ${gender === "Masculin" ? styles.selected : ""}`}
                      onClick={() => setGender("Masculin")}
                    >
                      <span aria-hidden="true">♂</span> {t("auth.male")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.genderBtn} ${gender === "Féminin" ? styles.selected : ""}`}
                      onClick={() => setGender("Féminin")}
                    >
                      <span aria-hidden="true">♀</span> {t("auth.female")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={styles.pinHeader}>
                <h1 className={styles.title}>
                  {t("auth.verifyCode")} <em>{t("auth.verifyCodeEm")}</em>
                </h1>
                <p className={styles.subtitle}>
                  {t("auth.enterOtpSentTo")}{" "}
                  <span className={styles.otpEmail}>{email.trim()}</span>
                </p>
              </div>

              <PinPad
                length={6}
                value={otp}
                onChange={setOtp}
                error={otpError}
                disabled={otpVerifying || otpLocked}
              />

              {otpLocked && (
                <p className={styles.otpHint}>{t("auth.otpExhausted")}</p>
              )}

              <p className={styles.resendOtp}>
                {otpLocked
                  ? t("auth.requestNewCode")
                  : t("auth.noCodeReceived")}{" "}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResending || otpVerifying || otpResendCooldown.locked}
                >
                  {otpResendCooldown.locked
                    ? t("auth.resendIn", {
                        seconds: String(otpResendCooldown.remaining),
                      })
                    : isResending
                      ? t("auth.sending")
                      : t("auth.resend")}
                </button>
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <div className={styles.pinHeader}>
                <h1 className={styles.title}>
                  {t("auth.createCode")} <em>{t("auth.createCodeEm")}</em>
                </h1>
                <p className={styles.subtitle}>{t("auth.createPinSubtitle")}</p>
              </div>

              <PinPad length={5} value={pin} onChange={setPin} error={pinError} />
            </>
          )}

          {step === 4 && (
            <>
              <div className={styles.pinHeader}>
                <h1 className={styles.title}>
                  {t("auth.confirmCode")} <em>{t("auth.confirmCodeEm")}</em>
                </h1>
                <p className={styles.subtitle}>{t("auth.confirmPinSubtitle")}</p>
              </div>

              <PinPad length={5} value={pin} onChange={setPin} error={pinError} />
            </>
          )}

          {step === 1 && (
            <>
              <div className={styles.header}>
                <h1 className={styles.title}>
                  {t("auth.yourCredentials")}{" "}
                  <em>{t("auth.yourCredentialsEm")}</em>
                </h1>
                <p className={styles.subtitle}>
                  {t("auth.credentialsSubtitle")}
                </p>
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
                  />
                </div>

                <div className={styles.passwordField}>
                  <span className={styles.label}>{t("common.password")}</span>
                  <input
                    className={styles.input}
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.minChars")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label={t("common.password")}
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

                <div className={styles.passwordField}>
                  <span className={styles.label}>{t("common.confirm")}</span>
                  <input
                    className={styles.input}
                    type={showConfirm ? "text" : "password"}
                    placeholder={t("auth.retypePassword")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-label={t("common.confirm")}
                  />
                  <button
                    type="button"
                    className={styles.toggleVisibility}
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={
                      showConfirm
                        ? t("common.hidePassword")
                        : t("common.showPassword")
                    }
                  >
                    {showConfirm ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </button>
                  {confirmPassword.length > 0 &&
                    confirmPassword !== password && (
                      <p className={styles.hint}>
                        {t("auth.passwordsMismatch")}
                      </p>
                    )}
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {step === 0 && (
        <button
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={handleSubmit}
          disabled={!canNextStep0}
          style={{ marginTop: 26 }}
        >
          {t("common.next")}
          <ArrowRight aria-hidden="true" />
        </button>
      )}

      {step === 1 && (
        <div className={styles.stepFooter} style={{ marginTop: 26 }}>
          <button
            className={ui.back}
            onClick={handleBack}
            aria-label={t("common.back")}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <button
            className={`${ui.btn} ${ui.btnPrimary}`}
            onClick={handleSubmit}
            disabled={!canNextStep1 || isRegistering || registerCooldown.locked}
          >
            {registerCooldown.locked
              ? t("auth.rateLimitedCountdown", {
                  seconds: String(registerCooldown.remaining),
                })
              : isRegistering
                ? t("auth.creating")
                : t("auth.createAccount")}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className={styles.stepFooter} style={{ marginTop: 26 }}>
          <button
            className={ui.back}
            onClick={handleBack}
            aria-label={t("common.back")}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        </div>
      )}

      {step < 2 && (
        <p className={styles.footerLink}>
          {t("auth.alreadyAccount")}{" "}
          <button type="button" onClick={() => router.push("/auth/login")}>
            {t("auth.login")}
          </button>
        </p>
      )}
    </div>
  );
}

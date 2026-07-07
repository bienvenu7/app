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
import { PinPad } from "@/components/PinPad";
import ui from "@/components/ui.module.scss";
import styles from "@/app/auth/auth.module.scss";
import { confirmOtp, getAuth } from "@/app/actions/auth";
import { useGetCountries } from "@/hooks/useCountry";
import { useRegistration, useResendOtp } from "@/hooks/useAuthentication";
import { countryFlagEmoji } from "@/lib/flags";
import { savePinAuth } from "@/lib/storage";
import { Auth } from "@/providers/AuthContext";
import type { ICountry } from "@/types/country";

const TOTAL_STEPS = 5;

export default function RegisterPage() {
  const router = useRouter();
  const { fillState } = Auth();
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

  const resetOtpBuffer = useCallback(() => {
    setOtp("");
    setOtpError(false);
    setOtpVerifying(false);
    otpSubmittedRef.current = null;
  }, []);

  const resetPinBuffers = useCallback(() => {
    setPin("");
    setFirstPin("");
    setPinError(false);
  }, []);

  const completeSessionAndGoHome = useCallback(
    async (message?: string) => {
      const user = await getAuth();
      fillState(user);
      toast.success(message ?? "Votre compte a été créé avec succès !");
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
    if (!email.trim()) return;
    try {
      await resend();
      resetOtpBuffer();
      toast.success("Un nouveau code a été envoyé.");
    } catch {
      toast.error("Impossible de renvoyer le code.");
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

    try {
      await registerFn();
      resetOtpBuffer();
      go(2);
      toast.success("Un code à 6 chiffres vous a été envoyé par email.");
    } catch {
      toast.error("Une erreur s'est produite, veuillez réessayer.");
    }
  };

  useEffect(() => {
    if (step !== 2 || otp.length !== 6 || otpVerifying) return;
    if (otpSubmittedRef.current === otp) return;

    otpSubmittedRef.current = otp;
    setOtpVerifying(true);

    (async () => {
      try {
        await confirmOtp(email.trim(), otp);
        resetOtpBuffer();
        resetPinBuffers();
        go(3);
        toast.success("Code vérifié !");
      } catch {
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
  }, [otp, step, otpVerifying, email, resetOtpBuffer, resetPinBuffers]);

  useEffect(() => {
    if (step !== 3 || pin.length !== 5) return;
    const t = setTimeout(() => {
      setFirstPin(pin);
      setPin("");
      go(4);
    }, 150);
    return () => clearTimeout(t);
  }, [pin, step]);

  useEffect(() => {
    if (step !== 4 || pin.length !== 5) return;

    if (pin === firstPin) {
      let cancelled = false;
      (async () => {
        const now = Date.now();
        savePinAuth({
          email: email.trim(),
          pin,
          createdAt: now,
          lastUnlockAt: now,
        });
        try {
          await completeSessionAndGoHome("Votre code a été créé avec succès !");
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
      go(3);
      toast.error("Les codes ne correspondent pas, réessayez.");
    }, 500);
    return () => clearTimeout(t);
  }, [pin, step, firstPin, email, completeSessionAndGoHome]);

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div>
      <div className={styles.brandRow}>
        <Brand />
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
                  Vos <em>informations</em>
                </h1>
                <p className={styles.subtitle}>
                  Commençons par apprendre à vous connaître.
                </p>
              </div>

              <div className={styles.form}>
                <div className={styles.selectField} ref={selectRef}>
                  <span className={styles.label}>Pays</span>
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
                        ? "Chargement..."
                        : (selectedCountry?.pubicName ?? "Sélectionnez un pays")}
                    </span>
                    <span className={styles.chev}>
                      <ChevronDown aria-hidden="true" />
                    </span>
                  </button>

                  {countryOpen && (
                    <div className={styles.selectMenu} role="listbox">
                      <input
                        className={styles.selectSearch}
                        placeholder="Rechercher un pays..."
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        autoFocus
                      />
                      {filteredCountries.length === 0 && (
                        <div className={styles.selectEmpty}>
                          Aucun pays trouvé
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
                  <span className={styles.label}>Prénom</span>
                  <input
                    className={styles.input}
                    placeholder="Amadou"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    aria-label="Prénom"
                  />
                </div>

                <div>
                  <span className={styles.label}>Nom</span>
                  <input
                    className={styles.input}
                    placeholder="Diallo"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-label="Nom"
                  />
                </div>

                <div>
                  <span className={styles.label}>Genre</span>
                  <div className={styles.genderRow}>
                    <button
                      type="button"
                      className={`${styles.genderBtn} ${gender === "Masculin" ? styles.selected : ""}`}
                      onClick={() => setGender("Masculin")}
                    >
                      <span aria-hidden="true">♂</span> Masculin
                    </button>
                    <button
                      type="button"
                      className={`${styles.genderBtn} ${gender === "Féminin" ? styles.selected : ""}`}
                      onClick={() => setGender("Féminin")}
                    >
                      <span aria-hidden="true">♀</span> Féminin
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
                  Vérifiez votre <em>code</em>
                </h1>
                <p className={styles.subtitle}>
                  Entrez le code à 6 chiffres envoyé à{" "}
                  <span className={styles.otpEmail}>{email.trim()}</span>
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
            </>
          )}

          {step === 3 && (
            <>
              <div className={styles.pinHeader}>
                <h1 className={styles.title}>
                  Créez votre <em>code</em>
                </h1>
                <p className={styles.subtitle}>
                  Choisissez un code à 5 chiffres pour vos prochaines connexions.
                </p>
              </div>

              <PinPad length={5} value={pin} onChange={setPin} error={pinError} />
            </>
          )}

          {step === 4 && (
            <>
              <div className={styles.pinHeader}>
                <h1 className={styles.title}>
                  Confirmez votre <em>code</em>
                </h1>
                <p className={styles.subtitle}>
                  Ressaisissez le même code pour le confirmer.
                </p>
              </div>

              <PinPad length={5} value={pin} onChange={setPin} error={pinError} />
            </>
          )}

          {step === 1 && (
            <>
              <div className={styles.header}>
                <h1 className={styles.title}>
                  Vos <em>identifiants</em>
                </h1>
                <p className={styles.subtitle}>
                  Créez vos accès pour vous connecter.
                </p>
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
                  />
                </div>

                <div className={styles.passwordField}>
                  <span className={styles.label}>Mot de passe</span>
                  <input
                    className={styles.input}
                    type={showPassword ? "text" : "password"}
                    placeholder="Au moins 6 caractères"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label="Mot de passe"
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

                <div className={styles.passwordField}>
                  <span className={styles.label}>Confirmer</span>
                  <input
                    className={styles.input}
                    type={showConfirm ? "text" : "password"}
                    placeholder="Retapez votre mot de passe"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-label="Confirmer le mot de passe"
                  />
                  <button
                    type="button"
                    className={styles.toggleVisibility}
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={
                      showConfirm
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
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
                        Les mots de passe ne correspondent pas.
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
          Suivant
          <ArrowRight aria-hidden="true" />
        </button>
      )}

      {step === 1 && (
        <div className={styles.stepFooter} style={{ marginTop: 26 }}>
          <button className={ui.back} onClick={handleBack} aria-label="Retour">
            <ArrowLeft aria-hidden="true" />
          </button>
          <button
            className={`${ui.btn} ${ui.btnPrimary}`}
            onClick={handleSubmit}
            disabled={!canNextStep1 || isRegistering}
          >
            {isRegistering ? "Création..." : "Créer le compte"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className={styles.stepFooter} style={{ marginTop: 26 }}>
          <button className={ui.back} onClick={handleBack} aria-label="Retour">
            <ArrowLeft aria-hidden="true" />
          </button>
        </div>
      )}

      {step < 2 && (
        <p className={styles.footerLink}>
          Déjà un compte ?{" "}
          <button type="button" onClick={() => router.push("/auth/login")}>
            Se connecter
          </button>
        </p>
      )}
    </div>
  );
}

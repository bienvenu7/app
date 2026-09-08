"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, LogOut } from "lucide-react";
import { toast } from "sonner";
import styles from "./profile.module.scss";
import Loading from "@/components/Loading";
import { Auth } from "@/providers/AuthContext";
import { updateClient } from "@/app/actions/auth";
import {
  apiErrorMessage,
  isServiceUnavailable,
  isValidationError,
  unwrapAction,
} from "@/lib/auth-errors";
import { fetchSession } from "@/lib/session-client";
import { useGetCountries } from "@/hooks/useCountry";
import { useGetTransactionStatsMonthly } from "@/hooks/useTransaction";
import { countryFlagEmoji } from "@/lib/flags";
import { clearPinAuth } from "@/lib/storage";
import { useLogout } from "@/hooks/useAuthentication";
import type { ICountry } from "@/types/country";
import { useT } from "@/lib/i18n";
import {
  checkPhoneForCountry,
  normalizePhone,
  phoneRuleForCountry,
} from "@/lib/phone-rules";

function splitFullName(fullName?: string) {
  const parts = fullName?.trim().split(/\s+/) ?? [];
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function ProfilePage() {
  const t = useT();
  const router = useRouter();
  const {
    state: { user, isLoading },
    resetState,
    fillState,
  } = Auth();

  const { countries, isLoading: loadingCountries } = useGetCountries();
  const { stats, isGettingStats } = useGetTransactionStatsMonthly(user?.email);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryId, setCountryId] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const selectRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    setPhone(user.whatsappNumber ?? "");
    setCountryId(user.Country?.id ?? "");
  }, [user]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const { firstName, lastName } = splitFullName(user?.fullName);
  const initials =
    `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "··";

  const selectedCountry = useMemo(
    () => (countries as ICountry[])?.find((c) => c.id === countryId),
    [countries, countryId],
  );

  const countryForPhone = selectedCountry ?? user?.Country;

  const phoneRule = useMemo(
    () => phoneRuleForCountry(countryForPhone),
    [countryForPhone],
  );

  const formatPhoneError = (value: string): string | null => {
    if (!countryId && !user?.Country) {
      return t("profile.phoneCountryRequired");
    }
    if (!countryForPhone) {
      return loadingCountries ? null : t("profile.phoneCountryRequired");
    }
    const check = checkPhoneForCountry(value, countryForPhone);
    if (check.ok || check.reason === "unknown_country") return null;
    return t("profile.phoneInvalid", {
      index: check.rule.index,
      count: check.rule.localDigits,
      example: check.rule.example,
    });
  };

  const filteredCountries = useMemo(() => {
    const list = (countries as ICountry[]) ?? [];
    if (!countrySearch.trim()) return list;
    const q = countrySearch.trim().toLowerCase();
    return list.filter((c) => c.pubicName?.toLowerCase().includes(q));
  }, [countries, countrySearch]);

  const phoneChanged = useMemo(
    () => normalizePhone(phone) !== normalizePhone(user?.whatsappNumber ?? ""),
    [phone, user],
  );

  const { mutateAsync: saveProfile, isPending: isSaving } = useMutation({
    mutationKey: ["update-profile", user?.id],
    mutationFn: () =>
      unwrapAction(
        updateClient({
          // Envoyer le numéro inchangé serait un aller-retour WhatsApp pour rien.
          phone: phoneChanged ? phone.trim() : undefined,
          countryId: countryId || undefined,
        }),
      ),
  });

  const { logoutFn, islogout } = useLogout();

  const canSave = useMemo(() => {
    if (!user) return false;

    const initialCountryId = user.Country?.id ?? "";
    const hasChanges = phoneChanged || countryId !== initialCountryId;

    return hasChanges && (!!phone.trim() || !!countryId);
  }, [user, phone, phoneChanged, countryId]);

  const handleSave = async () => {
    if (!user) return;
    setPhoneError(null);
    setServiceError(null);

    const localPhoneError = formatPhoneError(phone);
    if (localPhoneError) {
      setPhoneError(localPhoneError);
      phoneRef.current?.focus();
      return;
    }

    try {
      const result = await saveProfile();

      if (result.requireRelogin) {
        toast.success(result.message || t("profile.reloginRequired"));
        clearPinAuth();
        resetState();
        setTimeout(() => router.push("/auth/login"), 1500);
        return;
      }

      toast.success(result.message || t("profile.saveSuccess"));
      const refreshed = await fetchSession();
      fillState(refreshed);
    } catch (error) {
      // 400 : numéro injoignable ou mal formé. Rien n'a été enregistré, pas
      // même les autres champs de la requête — la saisie doit être corrigée.
      if (isValidationError(error)) {
        setPhoneError(
          apiErrorMessage(error) ?? t("profile.whatsappUnreachable"),
        );
        phoneRef.current?.focus();
        return;
      }

      // 503 : WhatsApp indisponible côté serveur, la saisie n'est pas en cause.
      if (isServiceUnavailable(error)) {
        setServiceError(
          apiErrorMessage(error) ?? t("profile.whatsappUnavailable"),
        );
        return;
      }

      toast.error(t("profile.saveError"));
    }
  };

  const handleLogout = async () => {
    try {
      await logoutFn();
    } catch {
      // On nettoie la session locale même si l'API échoue
    } finally {
      clearPinAuth();
      resetState();
      router.push("/auth/login");
    }
  };

  if (isLoading || !user) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <Loading />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={`${styles.header} ${styles.pageHeader}`}>
        <h1 className={styles.title}>
          {t("profile.title")} <em>{t("profile.titleEm")}</em>
        </h1>
      </header>

      <div className={styles.pageSidebar}>
        <section className={styles.hero}>
          <div className={styles.avatar} aria-hidden="true">
            {initials}
          </div>
          <div className={styles.name}>{user.fullName}</div>
          <div className={styles.email}>{user.email}</div>
        </section>

        <div className={styles.stats}>
          <div className={styles.stat}>
            {isGettingStats ? (
              <Loading />
            ) : (
              <>
                <div className={styles.n}>{stats?.total ?? 0}</div>
                <div className={styles.l}>{t("home.transfersThisMonth")}</div>
              </>
            )}
          </div>
          <div className={styles.stat}>
            {isGettingStats ? (
              <Loading />
            ) : (
              <>
                <div className={styles.n}>{stats?.send ?? 0}</div>
                <div className={styles.l}>{t("home.sendsThisMonth")}</div>
              </>
            )}
          </div>
          <div className={styles.stat}>
            {isGettingStats ? (
              <Loading />
            ) : (
              <>
                <div className={styles.n}>{stats?.receive ?? 0}</div>
                <div className={styles.l}>{t("home.receivesThisMonth")}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <section className={`${styles.section} ${styles.pageForm}`}>
        <h2 className={styles.sectionTitle}>{t("profile.personalInfo")}</h2>

        <div className={styles.field}>
          <label>{t("common.firstName")}</label>
          <div className={styles.value}>{firstName || "—"}</div>
        </div>

        <div className={styles.field}>
          <label>{t("common.lastName")}</label>
          <div className={styles.value}>{lastName || "—"}</div>
        </div>

        <div className={styles.field}>
          <label>{t("common.email")}</label>
          <input
            type="email"
            value={email}
            readOnly
            aria-label={t("common.email")}
          />
        </div>

        <div
          className={`${styles.field} ${phoneError ? styles.fieldInvalid : ""}`}
        >
          <label htmlFor="profile-phone">{t("common.phone")}</label>
          <input
            id="profile-phone"
            ref={phoneRef}
            type="tel"
            inputMode="tel"
            placeholder={
              phoneRule ? `+${phoneRule.example}` : "+242 06 123 4567"
            }
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError(null);
            }}
            aria-label={t("common.phone")}
            aria-invalid={!!phoneError}
            aria-describedby={
              phoneError ? "profile-phone-error" : "profile-phone-hint"
            }
          />
        </div>

        {phoneError ? (
          <p className={styles.fieldError} id="profile-phone-error" role="alert">
            {phoneError}
          </p>
        ) : (
          <p className={styles.fieldHint} id="profile-phone-hint">
            {t("profile.whatsappHint")}
            {phoneRule && (
              <>
                {" "}
                {t("profile.phoneFormatHint", {
                  index: phoneRule.index,
                  count: phoneRule.localDigits,
                })}
              </>
            )}
          </p>
        )}

        <div className={styles.selectField} ref={selectRef}>
          <button
            type="button"
            className={`${styles.selectTrigger} ${countryOpen ? styles.open : ""}`}
            onClick={() => setCountryOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={countryOpen}
          >
            <label>{t("profile.residenceCountry")}</label>
            <div className={styles.row}>
              <span className={styles.flag} aria-hidden="true">
                {countryFlagEmoji(selectedCountry?.pubicName)}
              </span>
              <span className={styles.selVal}>
                {loadingCountries
                  ? t("common.loading")
                  : (selectedCountry?.pubicName ?? t("common.selectCountry"))}
              </span>
              <span className={styles.chev}>
                <ChevronDown aria-hidden="true" />
              </span>
            </div>
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
                    const nextCountry = (countries as ICountry[])?.find(
                      (item) => item.id === c.id,
                    );
                    const check = checkPhoneForCountry(phone, nextCountry);
                    if (!phone.trim() || check.ok || check.reason === "unknown_country") {
                      setPhoneError(null);
                      return;
                    }
                    setPhoneError(
                      t("profile.phoneInvalid", {
                        index: check.rule.index,
                        count: check.rule.localDigits,
                        example: check.rule.example,
                      }),
                    );
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

        {serviceError && (
          <div className={styles.serviceError} role="alert">
            <span>{serviceError}</span>
            <button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? t("profile.saving") : t("common.retry")}
            </button>
          </div>
        )}

        <button
          type="button"
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={isSaving || !canSave}
        >
          {isSaving ? t("profile.saving") : t("profile.saveChanges")}
        </button>

        <button
          type="button"
          className={styles.logoutBtn}
          onClick={handleLogout}
          disabled={islogout}
        >
          <LogOut size={18} aria-hidden="true" />
          {islogout ? t("profile.loggingOut") : t("profile.logout")}
        </button>
      </section>
    </div>
  );
}

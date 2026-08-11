"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, LogOut } from "lucide-react";
import { toast } from "sonner";
import styles from "./profile.module.scss";
import Loading from "@/components/Loading";
import { Auth } from "@/providers/AuthContext";
import { updateClient, getAuth } from "@/app/actions/auth";
import { useGetCountries } from "@/hooks/useCountry";
import { useGetTransactionStatsMonthly } from "@/hooks/useTransaction";
import { countryFlagEmoji } from "@/lib/flags";
import { clearPinAuth } from "@/lib/storage";
import { useLogout } from "@/hooks/useAuthentication";
import type { ICountry } from "@/types/country";
import { useT } from "@/lib/i18n";

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
  const selectRef = useRef<HTMLDivElement>(null);

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

  const filteredCountries = useMemo(() => {
    const list = (countries as ICountry[]) ?? [];
    if (!countrySearch.trim()) return list;
    const q = countrySearch.trim().toLowerCase();
    return list.filter((c) => c.pubicName?.toLowerCase().includes(q));
  }, [countries, countrySearch]);

  const { mutateAsync: saveProfile, isPending: isSaving } = useMutation({
    mutationKey: ["update-profile", user?.id],
    mutationFn: () =>
      updateClient({
        phone: phone.trim(),
        countryId: countryId || undefined,
      }),
  });

  const { logoutFn, islogout } = useLogout();

  const canSave = useMemo(() => {
    if (!user) return false;

    const initialPhone = (user.whatsappNumber ?? "").trim();
    const initialCountryId = user.Country?.id ?? "";
    const nextPhone = phone.trim();
    const hasChanges =
      nextPhone !== initialPhone || countryId !== initialCountryId;

    return hasChanges && (!!nextPhone || !!countryId);
  }, [user, phone, countryId]);

  const handleSave = async () => {
    if (!user) return;
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
      const refreshed = await getAuth();
      fillState(refreshed);
    } catch {
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

        <div className={styles.field}>
          <label>{t("common.phone")}</label>
          <input
            type="tel"
            placeholder="+242 06 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-label={t("common.phone")}
          />
        </div>

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

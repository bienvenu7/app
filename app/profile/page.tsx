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
import { useGetCountries } from "@/hooks/useCountry";
import { useGetTransactonByEmail } from "@/hooks/useTransaction";
import { actualDate } from "@/utils/moment";
import { countryFlagEmoji } from "@/lib/flags";
import { clearPinAuth } from "@/lib/storage";
import { useLogout } from "@/hooks/useAuthentication";
import type { ICountry } from "@/types/country";
import type { ITrasanctionResponse } from "@/types/transaction";

function splitFullName(fullName?: string) {
  const parts = fullName?.trim().split(/\s+/) ?? [];
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const {
    state: { user, isLoading },
    resetState,
  } = Auth();

  const { countries, isLoading: loadingCountries } = useGetCountries();
  const { transactions, isGettingTransaction } = useGetTransactonByEmail(
    user?.email,
    actualDate,
  );

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

  const totalCount = useMemo(() => {
    return (transactions as ITrasanctionResponse[])?.length ?? 0;
  }, [transactions]);

  const sendCount = useMemo(() => {
    return (
      (transactions as ITrasanctionResponse[])?.filter((t) => t.type === "SEND")
        .length ?? 0
    );
  }, [transactions]);

  const receiveCount = useMemo(() => {
    return (
      (transactions as ITrasanctionResponse[])?.filter(
        (t) => t.type === "RECEIVE",
      ).length ?? 0
    );
  }, [transactions]);

  const { mutateAsync: saveProfile, isPending: isSaving } = useMutation({
    mutationKey: ["update-profile", user?.id],
    mutationFn: () =>
      updateClient({
        userID: user!.id,
        phone,
        countryId,
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
      const message = await saveProfile();
      toast.success(message);
      clearPinAuth();
      resetState();
      setTimeout(() => router.push("/auth/login"), 1500);
    } catch {
      toast.error("Impossible d'enregistrer les modifications.");
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
          Mon <em>profil</em>
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
            {isGettingTransaction ? (
              <Loading />
            ) : (
              <>
                <div className={styles.n}>{totalCount}</div>
                <div className={styles.l}>Transferts</div>
              </>
            )}
          </div>
          <div className={styles.stat}>
            {isGettingTransaction ? (
              <Loading />
            ) : (
              <>
                <div className={styles.n}>{sendCount}</div>
                <div className={styles.l}>Envoyés</div>
              </>
            )}
          </div>
          <div className={styles.stat}>
            {isGettingTransaction ? (
              <Loading />
            ) : (
              <>
                <div className={styles.n}>{receiveCount}</div>
                <div className={styles.l}>Reçus</div>
              </>
            )}
          </div>
        </div>
      </div>

      <section className={`${styles.section} ${styles.pageForm}`}>
        <h2 className={styles.sectionTitle}>Informations personnelles</h2>

        <div className={styles.field}>
          <label>Prénom</label>
          <div className={styles.value}>{firstName || "—"}</div>
        </div>

        <div className={styles.field}>
          <label>Nom</label>
          <div className={styles.value}>{lastName || "—"}</div>
        </div>

        <div className={styles.field}>
          <label>Email</label>
          <input type="email" value={email} readOnly aria-label="Email" />
        </div>

        <div className={styles.field}>
          <label>Téléphone</label>
          <input
            type="tel"
            placeholder="+242 06 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-label="Téléphone"
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
            <label>Pays de résidence</label>
            <div className={styles.row}>
              <span className={styles.flag} aria-hidden="true">
                {countryFlagEmoji(selectedCountry?.pubicName)}
              </span>
              <span className={styles.selVal}>
                {loadingCountries
                  ? "Chargement..."
                  : (selectedCountry?.pubicName ?? "Sélectionnez un pays")}
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
                placeholder="Rechercher un pays..."
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                autoFocus
              />
              {filteredCountries.length === 0 && (
                <div className={styles.selectEmpty}>Aucun pays trouvé</div>
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
          {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>

        <button
          type="button"
          className={styles.logoutBtn}
          onClick={handleLogout}
          disabled={islogout}
        >
          <LogOut size={18} aria-hidden="true" />
          {islogout ? "Déconnexion..." : "Se déconnecter"}
        </button>
      </section>
    </div>
  );
}

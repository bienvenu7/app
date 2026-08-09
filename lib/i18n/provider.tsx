"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import moment from "moment";
import "moment/locale/fr";
import "moment/locale/ru";
import { setCookie } from "@/config/cookies";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";
import {
  dictionaries,
  getMessage,
  interpolate,
  type MessageKey,
} from "@/lib/i18n/dictionaries";
import type { Messages } from "@/lib/i18n/messages/fr";

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  moment.locale(locale);
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
  );

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setCookie(LOCALE_COOKIE, next, 365);
    applyDocumentLocale(next);
  }, []);

  const messages = dictionaries[locale];

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      const raw =
        getMessage(messages, key) ??
        getMessage(dictionaries.fr, key) ??
        key;
      return interpolate(raw, vars);
    },
    [messages],
  );

  const value = useMemo(
    () => ({ locale, messages, setLocale, t }),
    [locale, messages, setLocale, t],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LocaleProvider");
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}

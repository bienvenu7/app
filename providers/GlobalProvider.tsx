"use client";
import React from "react";
import ReactQueryProvider from "@/providers/RtQueryProvider";
import { AuthProvider } from "@/providers/AuthContext";
import { AiChatbot } from "@/components/ai-chatbot/AiChatbot";
import { Toaster } from "sonner";
import { LocaleProvider } from "@/lib/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

const GlobalProvider = ({
  children,
  locale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  locale?: Locale;
}) => {
  return (
    <LocaleProvider initialLocale={locale}>
      <ReactQueryProvider>
        <AuthProvider>
          {children}
          <AiChatbot />
        </AuthProvider>
        <Toaster position="bottom-center" richColors />
      </ReactQueryProvider>
    </LocaleProvider>
  );
};

export default GlobalProvider;

"use client";
import React from "react";
import ReactQueryProvider from "@/providers/RtQueryProvider";
import { AuthProvider } from "@/providers/AuthContext";
import { AiChatbot } from "@/components/ai-chatbot/AiChatbot";
import { Toaster } from "sonner";

const GlobalProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReactQueryProvider>
      <AuthProvider>
        {children}
        <AiChatbot />
      </AuthProvider>
      <Toaster position="bottom-center" richColors />
    </ReactQueryProvider>
  );
};

export default GlobalProvider;

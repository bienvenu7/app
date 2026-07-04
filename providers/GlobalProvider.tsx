"use client";
import React from "react";
import ReactQueryProvider from "@/providers/RtQueryProvider";
import { AuthProvider } from "@/providers/AuthContext";
import { Toaster } from "sonner";

const GlobalProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReactQueryProvider>
      <AuthProvider>{children}</AuthProvider>
      <Toaster position="bottom-center" richColors />
    </ReactQueryProvider>
  );
};

export default GlobalProvider;

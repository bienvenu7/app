import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Playfair_Display } from "next/font/google";
import "./globals.scss";
import { AppShell } from "@/components/app-shell";
import GlobalProvider from "@/providers/GlobalProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});
const playfair = Playfair_Display({
  variable: "--font-serif",
  style: ["italic", "normal"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AFRU-E · Transfert d'argent Russie ↔ Afrique",
  description:
    "Transférez de l'argent entre la Russie et l'Afrique, rapidement et en toute sécurité.",
  generator: "v0.app",
};

export const viewport: Viewport = {
  themeColor: "#0b0f1a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${playfair.variable}`}>
      <body>
        <GlobalProvider>
          <AppShell>{children}</AppShell>
        </GlobalProvider>

        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}

import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Playfair_Display } from "next/font/google";
import "./globals.scss";
import { AppShell } from "@/components/app-shell";
import GlobalProvider from "@/providers/GlobalProvider";
import { getRequestLocale } from "@/lib/i18n/server";
import { dictionaries } from "@/lib/i18n/dictionaries";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});
const playfair = Playfair_Display({
  variable: "--font-serif",
  style: ["italic", "normal"],
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const shortcut = `/favicon/favicon-32x32.png`;
const apple = `/favicon/apple-touch-icon.png`;
const icon = `/favicon/favicon-16x16.png`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const messages = dictionaries[locale];
  return {
    title: messages.meta.title,
    description: messages.meta.description,
    icons: {
      icon,
      shortcut,
      apple,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0f1a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${playfair.variable}`}
    >
      <body>
        <GlobalProvider locale={locale}>
          <AppShell>{children}</AppShell>
        </GlobalProvider>

        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}

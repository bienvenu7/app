export const locales = ["fr", "ru"] as const;
export type Locale = (typeof locales)[number];

export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "fr" || value === "ru";
}

/** Russian device → ru, everything else → fr */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const preferred = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number.parseFloat(q.split("=")[1] ?? "1") : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 1 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of preferred) {
    if (tag === "ru" || tag.startsWith("ru-")) return "ru";
    if (tag === "fr" || tag.startsWith("fr-")) return "fr";
  }

  return DEFAULT_LOCALE;
}

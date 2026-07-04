// Small lookup used to render a flag emoji next to a country name coming
// from the API (which does not provide one). Falls back to a globe emoji
// for countries not listed here.
const FLAGS: Record<string, string> = {
  "côte d'ivoire": "🇨🇮",
  "cote d'ivoire": "🇨🇮",
  senegal: "🇸🇳",
  sénégal: "🇸🇳",
  cameroun: "🇨🇲",
  congo: "🇨🇬",
  "republique du congo": "🇨🇬",
  "république du congo": "🇨🇬",
  "rdc": "🇨🇩",
  "republique democratique du congo": "🇨🇩",
  "république démocratique du congo": "🇨🇩",
  mali: "🇲🇱",
  guinee: "🇬🇳",
  guinée: "🇬🇳",
  benin: "🇧🇯",
  bénin: "🇧🇯",
  togo: "🇹🇬",
  niger: "🇳🇪",
  "burkina faso": "🇧🇫",
  gabon: "🇬🇦",
  tchad: "🇹🇩",
  mauritanie: "🇲🇷",
  nigeria: "🇳🇬",
  ghana: "🇬🇭",
  maroc: "🇲🇦",
  algerie: "🇩🇿",
  algérie: "🇩🇿",
  tunisie: "🇹🇳",
  russie: "🇷🇺",
  russia: "🇷🇺",
  france: "🇫🇷",
};

export function countryFlagEmoji(name?: string | null): string {
  if (!name) return "🌍";
  return FLAGS[name.trim().toLowerCase()] ?? "🌍";
}

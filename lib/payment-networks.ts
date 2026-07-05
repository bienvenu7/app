const FLAG_NETWORKS = [
  { id: "mtn", flag: "/mtn.png" },
  { id: "airtel", flag: "/airtel.png" },
  { id: "orange", flag: "/partners/orange1.png" },
  { id: "wave", flag: "/partners/wave.png" },
  { id: "sberBank", flag: "/partners/sber.png" },
  { id: "vtb Bank", flag: "/partners/vtb.png" },
  { id: "alfa Bank", flag: "/partners/alfa.png" },
  { id: "mtc", flag: "/partners/mtc.png" },
] as const;

export function getLinks(name: string): string | undefined {
  return FLAG_NETWORKS.find((el) => el.id === name)?.flag;
}

/** Login / OTP : exactement un identifiant — jamais plusieurs, jamais aucun. */
export type LoginMethod = "email" | "phone";
export type OtpChannel = "email" | "whatsapp";

export type AuthIdentifier =
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string }
  | { kind: "whatsapp"; whatsappNumber: string };

export function identifierPayload(
  id: AuthIdentifier,
): { email: string } | { phone: string } | { whatsappNumber: string } {
  if (id.kind === "email") {
    return { email: id.email.trim().toLowerCase() };
  }
  if (id.kind === "whatsapp") {
    return { whatsappNumber: id.whatsappNumber };
  }
  return { phone: id.phone };
}

/** Login / forgot / reset : email XOR phone — jamais `whatsappNumber`. */
export function emailOrPhonePayload(
  id: AuthIdentifier,
): { email: string } | { phone: string } {
  if (id.kind === "email") {
    return { email: id.email.trim().toLowerCase() };
  }
  return { phone: id.kind === "phone" ? id.phone : id.whatsappNumber };
}

export function loginMethodFromIdentifier(id: AuthIdentifier): LoginMethod {
  return id.kind === "email" ? "email" : "phone";
}

export function identifierKey(id: AuthIdentifier | null | undefined): string {
  if (!id) return "";
  if (id.kind === "email") return `email:${id.email}`;
  if (id.kind === "whatsapp") return `whatsapp:${id.whatsappNumber}`;
  return `phone:${id.phone}`;
}

export function identifierDisplay(id: AuthIdentifier): string {
  if (id.kind === "email") return id.email;
  if (id.kind === "whatsapp") return id.whatsappNumber;
  return id.phone;
}

export function parseLoginMethod(value: unknown): LoginMethod | null {
  return value === "email" || value === "phone" ? value : null;
}

export function parseOtpChannel(value: unknown): OtpChannel | null {
  return value === "email" || value === "whatsapp" ? value : null;
}

export function fallbackOtpChannel(id: AuthIdentifier): OtpChannel {
  return id.kind === "email" ? "email" : "whatsapp";
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

/** Exactement un parmi email / phone / whatsappNumber. */
export function parseXorIdentifier(
  rec: Record<string, unknown>,
): AuthIdentifier | null {
  const email = typeof rec.email === "string" ? rec.email.trim() : "";
  const phone = typeof rec.phone === "string" ? digitsOnly(rec.phone) : "";
  const whatsappNumber =
    typeof rec.whatsappNumber === "string"
      ? digitsOnly(rec.whatsappNumber)
      : "";
  const count = [email, phone, whatsappNumber].filter(Boolean).length;
  if (count !== 1) return null;
  if (email) return { kind: "email", email };
  if (whatsappNumber) return { kind: "whatsapp", whatsappNumber };
  return { kind: "phone", phone };
}

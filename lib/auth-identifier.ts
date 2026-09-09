/** Login / OTP : exactement un identifiant — jamais les deux, jamais aucun. */
export type LoginMethod = "email" | "phone";
export type OtpChannel = "email" | "whatsapp";

export type AuthIdentifier =
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string };

export function identifierPayload(
  id: AuthIdentifier,
): { email: string } | { phone: string } {
  if (id.kind === "email") {
    return { email: id.email.trim().toLowerCase() };
  }
  return { phone: id.phone };
}

export function parseLoginMethod(value: unknown): LoginMethod | null {
  return value === "email" || value === "phone" ? value : null;
}

export function parseOtpChannel(value: unknown): OtpChannel | null {
  return value === "email" || value === "whatsapp" ? value : null;
}

export function fallbackOtpChannel(id: AuthIdentifier): OtpChannel {
  return id.kind === "phone" ? "whatsapp" : "email";
}

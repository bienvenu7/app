/** Signed `authSession` cookie — Edge + Node (Web Crypto). */

const encoder = new TextEncoder();

function getAuthSessionSecret(): string {
  const fromEnv = process.env.AUTH_SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  return "afrue-auth-session-v1";
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(sig);
}

export async function createSignedAuthSession(
  maxAgeSec: number,
): Promise<string> {
  const exp = Date.now() + maxAgeSec * 1000;
  const payload = String(exp);
  const mac = await hmacHex(getAuthSessionSecret(), payload);
  return `${payload}.${mac}`;
}

export async function isSignedAuthSessionValid(
  value: string | undefined | null,
): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  if (!/^[0-9a-f]+$/i.test(mac)) return false;

  const expected = await hmacHex(getAuthSessionSecret(), payload);
  return timingSafeEqualHex(mac.toLowerCase(), expected);
}

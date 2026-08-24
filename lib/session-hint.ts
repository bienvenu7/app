/** Signed `authSession` cookie — Edge + Node (Web Crypto). */

const encoder = new TextEncoder();

const MIN_SECRET_LENGTH = 16;

/**
 * Read at runtime on every call — `next-server` loads `.env` at boot and the
 * value stays a runtime lookup in the Edge bundle, so it must never be cached
 * or defaulted. A predictable secret would let anyone forge `authSession`.
 */
function getAuthSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return secret;
}

/** Call at process boot so a missing secret is a PM2 crash, not a stuck OTP screen. */
export function assertAuthSessionSecret(): void {
  getAuthSessionSecret();
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

  try {
    const expected = await hmacHex(getAuthSessionSecret(), payload);
    return timingSafeEqualHex(mac.toLowerCase(), expected);
  } catch {
    // Missing AUTH_SESSION_SECRET must not 500 every request in middleware.
    return false;
  }
}

"use client";

/** PBKDF2-SHA-256 params (browser Web Crypto). */
export const PIN_PBKDF2_ITERATIONS = 210_000;
const PIN_HASH_BITS = 256;
const SALT_BYTES = 16;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

async function importPinKey(pin: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
}

async function derivePinBits(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await importPinKey(pin);
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // Web Crypto accepts BufferSource; cast keeps TS happy across lib versions
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    key,
    PIN_HASH_BITS,
  );
}

export type HashedPin = {
  pinHash: string;
  salt: string;
  iterations: number;
};

/** Hash a PIN for device-local storage. Never persist the raw PIN. */
export async function hashPin(pin: string): Promise<HashedPin> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const bits = await derivePinBits(pin, salt, PIN_PBKDF2_ITERATIONS);
  return {
    pinHash: toBase64(bits),
    salt: toBase64(salt),
    iterations: PIN_PBKDF2_ITERATIONS,
  };
}

/** Constant-time compare of PIN against stored hash. */
export async function verifyPinHash(
  pin: string,
  stored: Pick<HashedPin, "pinHash" | "salt" | "iterations">,
): Promise<boolean> {
  if (!stored.pinHash || !stored.salt || !stored.iterations) return false;
  try {
    const salt = fromBase64(stored.salt);
    const bits = await derivePinBits(pin, salt, stored.iterations);
    return timingSafeEqual(new Uint8Array(bits), fromBase64(stored.pinHash));
  } catch {
    return false;
  }
}

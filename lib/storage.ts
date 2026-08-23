"use client"

export type TransferType = "send" | "receive"

export type Transaction = {
  txid: string
  type: TransferType
  createdAt: string // ISO
  status: "completed"
  // countries
  fromCode: string
  toCode: string
  // amounts
  amountSource: number
  fee: number
  received: number
  // people
  senderFirstName: string
  senderLastName: string
  recipientFirstName: string
  recipientLastName: string
  recipientPhone: string
  paymentMethod: string
}

export type Draft = {
  type: TransferType
  fromCode: string
  toCode: string
  amountSource: number
  fee: number
  received: number
  senderFirstName: string
  senderLastName: string
  recipientFirstName: string
  recipientLastName: string
  recipientPhone: string
  paymentMethod: string
  acceptedTerms: boolean
}

export type Profile = {
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  memberSince: string
}

export type PinAuth = {
  email: string
  /** PBKDF2 digest (base64) — never the raw PIN */
  pinHash: string
  salt: string
  iterations: number
  name?: string
  createdAt?: number
  lastUnlockAt?: number
  failedAttempts?: number
  /** Epoch ms — PIN pad locked until this time */
  lockedUntil?: number
}

/** @deprecated Legacy plaintext shape — wiped on read */
type LegacyPinAuth = {
  email: string
  pin: string
  name?: string
  createdAt?: number
  lastUnlockAt?: number
}

const TX_KEY = "afrue.transactions"
const DRAFT_KEY = "afrue.draft"
const PROFILE_KEY = "afrue.profile"
const PIN_KEY = "afrue.pinAuth"
const LEGACY_PII_KEYS = [TX_KEY, DRAFT_KEY, PROFILE_KEY] as const

/** 3 months */
export const PIN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
/** Lock after 15 minutes without user activity */
export const PIN_RELOCK_MS = 15 * 60 * 1000
/** Min interval between activity timestamp writes */
export const PIN_ACTIVITY_THROTTLE_MS = 30_000
/** Failed PIN attempts before lockout */
export const PIN_MAX_ATTEMPTS = 5
/** Lockout duration after max failed attempts */
export const PIN_LOCKOUT_MS = 5 * 60 * 1000

function isBrowser() {
  return typeof window !== "undefined"
}

/** Remove leftover drafts / local TX / fake profiles (PII). PIN stays. */
export function wipeLegacyPiiStorage() {
  if (!isBrowser()) return
  for (const key of LEGACY_PII_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

export function genTxid() {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase()
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  return `AF-${time}${rnd}`
}

export function getTransactions(): Transaction[] {
  wipeLegacyPiiStorage()
  return []
}

export function saveTransaction(_tx: Transaction) {
  wipeLegacyPiiStorage()
}

export function getDraft(): Draft | null {
  wipeLegacyPiiStorage()
  return null
}

export function saveDraft(_draft: Draft) {
  wipeLegacyPiiStorage()
}

export function clearDraft() {
  wipeLegacyPiiStorage()
}

export function getProfile(): Profile | null {
  wipeLegacyPiiStorage()
  return null
}

export function saveProfile(_profile: Profile) {
  wipeLegacyPiiStorage()
}

function isHashedPinAuth(value: unknown): value is PinAuth {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.email === "string" &&
    typeof v.pinHash === "string" &&
    typeof v.salt === "string" &&
    typeof v.iterations === "number" &&
    !("pin" in v)
  )
}

function isLegacyPlainPinAuth(value: unknown): value is LegacyPinAuth {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.email === "string" && typeof v.pin === "string"
}

// PIN auth: device unlock with a short code instead of re-typing credentials.
export function getSavedPinAuth(): PinAuth | null {
  if (!isBrowser()) return null
  wipeLegacyPiiStorage()
  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)

    // Invalidate plaintext PIN storage immediately (step 2 migration).
    if (isLegacyPlainPinAuth(parsed)) {
      clearPinAuth()
      return null
    }

    if (!isHashedPinAuth(parsed)) {
      clearPinAuth()
      return null
    }

    return parsed
  } catch {
    clearPinAuth()
    return null
  }
}

export function isPinExpired(auth: PinAuth): boolean {
  if (!auth.createdAt) return false
  return Date.now() - auth.createdAt > PIN_MAX_AGE_MS
}

export function isPinUnlockRequired(auth: PinAuth): boolean {
  if (!auth.lastUnlockAt) return true
  return Date.now() - auth.lastUnlockAt > PIN_RELOCK_MS
}

export function isPinLocked(auth: PinAuth): boolean {
  return typeof auth.lockedUntil === "number" && auth.lockedUntil > Date.now()
}

export function getPinLockRemainingMs(auth: PinAuth): number {
  if (!isPinLocked(auth)) return 0
  return Math.max(0, (auth.lockedUntil ?? 0) - Date.now())
}

/** Refresh activity timestamp (throttled) so active users never get locked. */
export function touchPinActivity(auth?: PinAuth | null): void {
  const current = auth ?? getValidPinAuth()
  if (!current) return

  const now = Date.now()
  const last = current.lastUnlockAt ?? 0
  if (now - last < PIN_ACTIVITY_THROTTLE_MS) return

  persistPinAuth({ ...current, lastUnlockAt: now })
}

export function getValidPinAuth(): PinAuth | null {
  const auth = getSavedPinAuth()
  if (!auth) return null
  if (isPinExpired(auth)) {
    clearPinAuth()
    return null
  }
  return auth
}

function persistPinAuth(auth: PinAuth) {
  if (!isBrowser()) return
  const now = Date.now()
  localStorage.setItem(
    PIN_KEY,
    JSON.stringify({
      ...auth,
      createdAt: auth.createdAt ?? now,
      lastUnlockAt: auth.lastUnlockAt ?? now,
    }),
  )
}

/** Create or replace device PIN — stores PBKDF2 hash only. */
export async function savePinAuth(input: {
  email: string
  pin: string
  name?: string
  createdAt?: number
  lastUnlockAt?: number
}): Promise<PinAuth> {
  const { hashPin } = await import("@/lib/pin-crypto")
  const hashed = await hashPin(input.pin)
  const now = Date.now()
  const auth: PinAuth = {
    email: input.email,
    name: input.name,
    pinHash: hashed.pinHash,
    salt: hashed.salt,
    iterations: hashed.iterations,
    createdAt: input.createdAt ?? now,
    lastUnlockAt: input.lastUnlockAt ?? now,
    failedAttempts: 0,
    lockedUntil: undefined,
  }
  persistPinAuth(auth)
  return auth
}

export async function verifySavedPin(
  pin: string,
  auth: PinAuth,
): Promise<boolean> {
  const { verifyPinHash } = await import("@/lib/pin-crypto")
  return verifyPinHash(pin, auth)
}

/** Record a failed unlock; may engage lockout. Returns updated record. */
export function recordPinFailure(auth: PinAuth): PinAuth {
  const failedAttempts = (auth.failedAttempts ?? 0) + 1
  const updated: PinAuth = {
    ...auth,
    failedAttempts,
    lockedUntil:
      failedAttempts >= PIN_MAX_ATTEMPTS
        ? Date.now() + PIN_LOCKOUT_MS
        : auth.lockedUntil,
  }
  // After lockout starts, reset counter so the next window is fresh.
  if (failedAttempts >= PIN_MAX_ATTEMPTS) {
    updated.failedAttempts = 0
  }
  persistPinAuth(updated)
  return updated
}

export function touchPinUnlock(auth: PinAuth) {
  persistPinAuth({
    ...auth,
    lastUnlockAt: Date.now(),
    failedAttempts: 0,
    lockedUntil: undefined,
  })
}

export function clearPinAuth() {
  if (!isBrowser()) return
  localStorage.removeItem(PIN_KEY)
}

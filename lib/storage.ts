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
  pin: string
  name?: string
  createdAt?: number
  lastUnlockAt?: number
}

const TX_KEY = "afrue.transactions"
const DRAFT_KEY = "afrue.draft"
const PROFILE_KEY = "afrue.profile"
const PIN_KEY = "afrue.pinAuth"

/** 3 months */
export const PIN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
/** 8 hours */
export const PIN_RELOCK_MS = 8 * 60 * 60 * 1000

const DEFAULT_PROFILE: Profile = {
  firstName: "Amadou",
  lastName: "Diallo",
  email: "amadou.diallo@example.com",
  phone: "+225 07 00 00 00 00",
  country: "CI",
  memberSince: "2024-01-15",
}

function isBrowser() {
  return typeof window !== "undefined"
}

export function genTxid() {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase()
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  return `AF-${time}${rnd}`
}

export function getTransactions(): Transaction[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(TX_KEY)
    return raw ? (JSON.parse(raw) as Transaction[]) : []
  } catch {
    return []
  }
}

export function saveTransaction(tx: Transaction) {
  if (!isBrowser()) return
  const list = getTransactions()
  list.unshift(tx)
  localStorage.setItem(TX_KEY, JSON.stringify(list))
}

export function getDraft(): Draft | null {
  if (!isBrowser()) return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft) {
  if (!isBrowser()) return
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

export function clearDraft() {
  if (!isBrowser()) return
  localStorage.removeItem(DRAFT_KEY)
}

export function getProfile(): Profile {
  if (!isBrowser()) return DEFAULT_PROFILE
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : DEFAULT_PROFILE
  } catch {
    return DEFAULT_PROFILE
  }
}

export function saveProfile(profile: Profile) {
  if (!isBrowser()) return
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

// PIN auth: device unlock with a short code instead of re-typing credentials.
export function getSavedPinAuth(): PinAuth | null {
  if (!isBrowser()) return null
  try {
    const raw = localStorage.getItem(PIN_KEY)
    return raw ? (JSON.parse(raw) as PinAuth) : null
  } catch {
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

export function getValidPinAuth(): PinAuth | null {
  const auth = getSavedPinAuth()
  if (!auth) return null
  if (isPinExpired(auth)) {
    clearPinAuth()
    return null
  }
  return auth
}

export function savePinAuth(auth: PinAuth) {
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

export function touchPinUnlock(auth: PinAuth) {
  savePinAuth({ ...auth, lastUnlockAt: Date.now() })
}

export function clearPinAuth() {
  if (!isBrowser()) return
  localStorage.removeItem(PIN_KEY)
}

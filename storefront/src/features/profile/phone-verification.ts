import { supabase } from "../../lib/supabase"

export const normalizePhilippineMobile = (value: string) => {
  const compact = value.trim().replace(/[\s().-]/g, "")
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`
  if (/^639\d{9}$/.test(compact)) return `+${compact}`
  if (/^\+639\d{9}$/.test(compact)) return compact
  return null
}

export const maskPhilippineMobile = (value: string) => {
  const phone = normalizePhilippineMobile(value)
  return phone ? `${phone.slice(0, 5)}•••${phone.slice(-4)}` : "your mobile number"
}

export const normalizeOtp = (value: string) => value.normalize("NFKC").replace(/\D/g, "").slice(0, 6)
export const isSixDigitOtp = (value: string) => /^\d{6}$/.test(value)
export const secondsUntil = (deadline: number, now = Date.now()) => Math.max(0, Math.ceil((deadline - now) / 1000))
export const countdownLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

export type VerifiedPhone = { phone: string; phoneVerifiedAt: string }
export type PhoneChallenge = {
  id: string
  phone: string
  maskedPhone: string
  expiresAt: number
  resendAvailableAt: number
}

export const isVerifiedPhone = (draft: string, saved: string, verifiedAt?: string | null) => {
  const normalized = normalizePhilippineMobile(draft)
  return Boolean(normalized && normalized === normalizePhilippineMobile(saved) && verifiedAt && Number.isFinite(Date.parse(verifiedAt)))
}

export class PhoneVerificationError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryAfter = 0,
    readonly attemptsRemaining: number | null = null,
  ) {
    super(message)
    this.name = "PhoneVerificationError"
  }
}

type VerificationPayload = { action: "request"; phone: string } | { action: "verify"; challengeId: string; code: string }
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}

export async function invokePhoneVerification(payload: VerificationPayload, signal?: AbortSignal) {
  const { data, error } = await supabase.functions.invoke("verify-customer-phone", {
    body: payload,
    headers: { "x-cozycraft-platform": "mobile" },
    signal,
    timeout: 25_000,
  })
  if (error) {
    const response = (error as { context?: Response }).context
    const body = response && typeof response.clone === "function"
      ? record(await response.clone().json().catch(() => null))
      : record(data)
    const status = response?.status || 0
    throw new PhoneVerificationError(
      typeof body.error === "string" ? body.error : status === 401
        ? "Your session has expired. Please sign in again."
        : "We couldn’t reach phone verification. Check your connection and try again.",
      status,
      Math.max(0, Number(body.retryAfter) || (status === 429 ? 60 : 0)),
      typeof body.attemptsRemaining === "number" ? body.attemptsRemaining : null,
    )
  }
  const body = record(data)
  if (typeof body.error === "string") throw new PhoneVerificationError(body.error)
  return body
}

export async function requestPhoneVerification(phone: string, signal?: AbortSignal): Promise<
  { kind: "challenge"; challenge: PhoneChallenge } | { kind: "verified"; verified: VerifiedPhone }
> {
  const normalized = normalizePhilippineMobile(phone)
  if (!normalized) throw new PhoneVerificationError("Enter a valid Philippine mobile number, such as 0917 123 4567.")
  const body = await invokePhoneVerification({ action: "request", phone: normalized }, signal)
  if (body.status === "already_verified") {
    // Read the actual verification timestamp. Never manufacture a verified
    // state from a local date or from merely requesting an SMS.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session?.user) throw new PhoneVerificationError("Please sign in again to refresh your verified number.", 401)
    const { data, error } = await supabase.from("profiles")
      .select("phone,phone_verified_at").eq("id", sessionData.session.user.id).single()
    if (error || !isVerifiedPhone(normalized, data?.phone || "", data?.phone_verified_at)) {
      throw new PhoneVerificationError("Your saved number could not be refreshed. Please try again.")
    }
    return { kind: "verified", verified: { phone: data.phone, phoneVerifiedAt: data.phone_verified_at } }
  }
  const expiresAt = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN
  if (body.status !== "code_sent" || typeof body.challengeId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.challengeId) ||
      !Number.isFinite(expiresAt)) {
    throw new PhoneVerificationError("The verification service returned an incomplete response. Please try again shortly.")
  }
  return {
    kind: "challenge",
    challenge: {
      id: body.challengeId,
      phone: normalized,
      maskedPhone: typeof body.maskedPhone === "string" ? body.maskedPhone : maskPhilippineMobile(normalized),
      expiresAt,
      resendAvailableAt: Date.now() + Math.max(60, Number(body.resendAfter) || 0) * 1000,
    },
  }
}

export async function confirmPhoneVerification(challenge: PhoneChallenge, code: string, signal?: AbortSignal): Promise<VerifiedPhone> {
  if (!isSixDigitOtp(code)) throw new PhoneVerificationError("Enter the complete six-digit verification code.")
  if (Date.now() >= challenge.expiresAt) throw new PhoneVerificationError("This code has expired. Request a new one.")
  const body = await invokePhoneVerification({ action: "verify", challengeId: challenge.id, code }, signal)
  if (body.status !== "verified" || typeof body.phone !== "string" || typeof body.phoneVerifiedAt !== "string" ||
      !isVerifiedPhone(challenge.phone, body.phone, body.phoneVerifiedAt)) {
    throw new PhoneVerificationError("Your number could not be confirmed as saved. Please refresh your profile and try again.")
  }
  return { phone: body.phone, phoneVerifiedAt: body.phoneVerifiedAt }
}

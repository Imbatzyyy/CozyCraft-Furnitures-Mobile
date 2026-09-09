import type { User } from "@supabase/supabase-js"
import { supabase } from "../../lib/supabase"

export type MobileWelcomeVoucher = {
  id: string
  code: string
  discountAmount: number
  minimumOrderAmount: number
  expiresAt: string
}

export type MobileGoogleOnboardingStatus = {
  userId: string
  isGoogle: boolean
  needsUsername: boolean
  username: string
  showVoucher: boolean
  voucher: MobileWelcomeVoucher | null
}

// Username completion is irreversible within a signed-in onboarding session.
// A request started before the save must not reopen the setup form afterward.
export function mergeGoogleOnboarding(current: MobileGoogleOnboardingStatus | null, incoming: MobileGoogleOnboardingStatus) {
  if (current?.userId === incoming.userId && current.username && !current.needsUsername && incoming.needsUsername) return current
  return incoming
}

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

export function isGoogleCustomer(user: User) {
  const provider = String(user.app_metadata?.provider || "")
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers.map(String)
    : []
  return provider === "google" || providers.includes("google")
}

export function emptyGoogleOnboardingStatus(userId: string): MobileGoogleOnboardingStatus {
  return {
    userId,
    isGoogle: false,
    needsUsername: false,
    username: "",
    showVoucher: false,
    voucher: null,
  }
}

export function parseGoogleOnboardingStatus(
  value: unknown,
  fallbackUserId = "",
): MobileGoogleOnboardingStatus {
  const source = recordValue(value)
  const rawVoucher = recordValue(source.voucher)
  const voucherId = String(rawVoucher.id || "")
  const voucher = voucherId ? {
    id: voucherId,
    code: String(rawVoucher.code || ""),
    discountAmount: Number(rawVoucher.discountAmount || 0),
    minimumOrderAmount: Number(rawVoucher.minimumOrderAmount || 0),
    expiresAt: String(rawVoucher.expiresAt || ""),
  } : null

  return {
    userId: String(source.userId || fallbackUserId),
    isGoogle: source.isGoogle === true,
    needsUsername: source.needsUsername === true,
    username: String(source.username || ""),
    showVoucher: source.showVoucher === true && Boolean(voucher),
    voucher,
  }
}

function onboardingError(error: unknown, fallback: string) {
  const source = recordValue(error)
  const message = String(source.message || fallback)
  const code = String(source.code || "")
  if (code === "23505" || /duplicate|unique|already complete/i.test(message)) {
    return new Error("That username is already taken. Try another one.")
  }
  if (/3-24|3–24|letters, numbers/i.test(message)) {
    return new Error("Use 3–24 letters, numbers, dots, underscores, or hyphens.")
  }
  return new Error(fallback)
}

export async function loadMobileGoogleOnboarding(user: User) {
  // The provider changes username setup, not eligibility to see a welcome
  // reward. Issuance and one-time presentation remain database-controlled.
  const { data, error } = await supabase.rpc("get_mobile_customer_onboarding")
  if (error) throw onboardingError(error, "We couldn’t check your welcome reward. Check your connection and try again.")
  return parseGoogleOnboardingStatus(data, user.id)
}

export async function completeMobileGoogleOnboarding(username: string) {
  const { data, error } = await supabase.rpc("complete_mobile_google_onboarding", {
    p_username: username.trim(),
  })
  if (error) throw onboardingError(error, "Your username could not be saved. Please try again.")
  return parseGoogleOnboardingStatus(data)
}

export async function acknowledgeMobileWelcomeVoucher() {
  const { data, error } = await supabase.rpc("acknowledge_mobile_welcome_voucher")
  if (error) throw onboardingError(error, "Your welcome reward is safe, but this message could not be dismissed yet.")
  return parseGoogleOnboardingStatus(data)
}

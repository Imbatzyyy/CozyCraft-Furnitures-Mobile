import { supabase } from "../../lib/supabase"

export type MobileOnlinePaymentMethod = "card" | "gcash"

export type PaymentVerificationIntent = {
  addressId: string
  checkoutKey: string
  paymentMethod: MobileOnlinePaymentMethod
  items: Array<{ product_id: string; quantity: number }>
  redemptionId: string | null
}

export type PaymentEmailChallenge = {
  id: string
  maskedEmail: string
  expiresAt: number
  resendAvailableAt: number
  intent: PaymentVerificationIntent
}

export type PaymentEmailAuthorization = {
  id: string
  checkoutKey: string
  paymentMethod: MobileOnlinePaymentMethod
  expiresAt: number
}

export class PaymentEmailVerificationError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryAfter = 0,
    readonly attemptsRemaining: number | null = null,
  ) {
    super(message)
    this.name = "PaymentEmailVerificationError"
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const checkoutKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const normalizePaymentEmailCode = (value: string) =>
  value.normalize("NFKC").replace(/\D/g, "").slice(0, 6)

export const isCompletePaymentEmailCode = (value: string) => /^\d{6}$/.test(value)

export const paymentVerificationSecondsUntil = (deadline: number, now = Date.now()) =>
  Math.max(0, Math.ceil((deadline - now) / 1000))

export const paymentVerificationCountdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

export const onlinePaymentMethodFor = (payment: string): MobileOnlinePaymentMethod | null =>
  payment === "GCash" ? "gcash" : payment.toLowerCase().includes("card") ? "card" : null

const invokePaymentVerification = async (body: Record<string, unknown>, signal?: AbortSignal) => {
  const { data, error } = await supabase.functions.invoke("verify-mobile-payment", {
    body,
    headers: { "x-cozycraft-platform": "mobile" },
    signal,
    timeout: 25_000,
  })
  if (error) {
    const response = (error as { context?: Response }).context
    const responseBody = response && typeof response.clone === "function"
      ? record(await response.clone().json().catch(() => null))
      : record(data)
    const status = response?.status || 0
    throw new PaymentEmailVerificationError(
      typeof responseBody.error === "string" ? responseBody.error : status === 401
        ? "Your session has expired. Please sign in again."
        : "We couldn’t reach payment verification. Check your connection and try again.",
      status,
      Math.max(0, Number(responseBody.retryAfter) || (status === 429 ? 60 : 0)),
      typeof responseBody.attemptsRemaining === "number" ? responseBody.attemptsRemaining : null,
    )
  }
  const responseBody = record(data)
  if (typeof responseBody.error === "string") throw new PaymentEmailVerificationError(responseBody.error)
  return responseBody
}

const validateIntent = (intent: PaymentVerificationIntent) => {
  if (!uuidPattern.test(intent.addressId) || !checkoutKeyPattern.test(intent.checkoutKey)) {
    throw new PaymentEmailVerificationError("Refresh checkout and try again before requesting a payment code.")
  }
  if (!intent.items.length || intent.items.length > 50 || intent.items.some((item) =>
    !item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) {
    throw new PaymentEmailVerificationError("Your checkout selection has changed. Return to your bag and try again.")
  }
}

export async function requestPaymentEmailVerification(
  intent: PaymentVerificationIntent,
  signal?: AbortSignal,
): Promise<PaymentEmailChallenge> {
  validateIntent(intent)
  const body = await invokePaymentVerification({ action: "request", ...intent }, signal)
  const expiresAt = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN
  if (body.status !== "code_sent" || typeof body.challengeId !== "string" ||
      !uuidPattern.test(body.challengeId) || typeof body.maskedEmail !== "string" ||
      !Number.isFinite(expiresAt) || body.checkoutKey !== intent.checkoutKey ||
      body.paymentMethod !== intent.paymentMethod) {
    throw new PaymentEmailVerificationError("The payment verification service returned an incomplete response. Please try again.")
  }
  return {
    id: body.challengeId,
    maskedEmail: body.maskedEmail,
    expiresAt,
    resendAvailableAt: Date.now() + Math.max(60, Number(body.resendAfter) || 0) * 1000,
    intent,
  }
}

export async function confirmPaymentEmailVerification(
  challenge: PaymentEmailChallenge,
  code: string,
  signal?: AbortSignal,
): Promise<PaymentEmailAuthorization> {
  if (!isCompletePaymentEmailCode(code)) {
    throw new PaymentEmailVerificationError("Enter the complete six-digit payment code.")
  }
  if (Date.now() >= challenge.expiresAt) {
    throw new PaymentEmailVerificationError("This payment code expired. Request a new one.")
  }
  const body = await invokePaymentVerification({ action: "verify", challengeId: challenge.id, code }, signal)
  const expiresAt = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN
  if (body.status !== "authorized" || body.authorizationId !== challenge.id ||
      body.checkoutKey !== challenge.intent.checkoutKey ||
      body.paymentMethod !== challenge.intent.paymentMethod || !Number.isFinite(expiresAt)) {
    throw new PaymentEmailVerificationError("Your payment code could not be confirmed for this checkout. Request a new one.")
  }
  return {
    id: body.authorizationId,
    checkoutKey: body.checkoutKey,
    paymentMethod: challenge.intent.paymentMethod,
    expiresAt,
  }
}

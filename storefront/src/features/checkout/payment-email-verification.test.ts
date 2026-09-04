import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  confirmPaymentEmailVerification,
  isCompletePaymentEmailCode,
  normalizePaymentEmailCode,
  onlinePaymentMethodFor,
  paymentVerificationCountdown,
  paymentVerificationSecondsUntil,
  requestPaymentEmailVerification,
  type PaymentEmailChallenge,
  type PaymentVerificationIntent,
} from "./payment-email-verification"

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock("../../lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }))

const checkoutKey = "30cfb521-9c92-4b8a-8dc7-b1cf8b663648"
const challengeId = "22a0851f-a10f-4e42-b16d-963f558701aa"
const intent: PaymentVerificationIntent = {
  addressId: "99bdb728-40a8-4575-ac91-31228449c349",
  checkoutKey,
  paymentMethod: "gcash",
  items: [{ product_id: "EKOLSUND", quantity: 1 }],
  redemptionId: null,
}
const challenge = (): PaymentEmailChallenge => ({
  id: challengeId,
  maskedEmail: "al••••@e••••••.com",
  expiresAt: Date.now() + 300_000,
  resendAvailableAt: Date.now() + 60_000,
  intent,
})

beforeEach(() => vi.resetAllMocks())

describe("mobile payment email verification", () => {
  it("normalizes pasted Unicode codes and preserves leading zeroes", () => {
    expect(normalizePaymentEmailCode("０１２ ３４５")).toBe("012345")
    expect(isCompletePaymentEmailCode("012345")).toBe(true)
    expect(isCompletePaymentEmailCode("12345")).toBe(false)
  })

  it("maps only GCash and card to protected online methods", () => {
    expect(onlinePaymentMethodFor("GCash")).toBe("gcash")
    expect(onlinePaymentMethodFor("Credit or debit card")).toBe("card")
    expect(onlinePaymentMethodFor("Cash on delivery")).toBeNull()
  })

  it("derives countdowns from absolute deadlines", () => {
    expect(paymentVerificationSecondsUntil(61_000, 0)).toBe(61)
    expect(paymentVerificationSecondsUntil(61_000, 62_000)).toBe(0)
    expect(paymentVerificationCountdown(61)).toBe("1:01")
  })

  it("requests a code for the exact checkout and keeps the server timer", async () => {
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    mocks.invoke.mockResolvedValue({ data: {
      status: "code_sent", challengeId, maskedEmail: "al••••@e••••••.com",
      expiresAt, resendAfter: 60, checkoutKey, paymentMethod: "gcash",
    }, error: null })
    const result = await requestPaymentEmailVerification(intent)
    expect(result.id).toBe(challengeId)
    expect(result.intent).toEqual(intent)
    expect(mocks.invoke).toHaveBeenCalledWith("verify-mobile-payment", expect.objectContaining({
      body: { action: "request", ...intent },
      headers: { "x-cozycraft-platform": "mobile" },
      timeout: 25_000,
    }))
  })

  it("never calls the server for malformed checkout details", async () => {
    await expect(requestPaymentEmailVerification({ ...intent, addressId: "not-an-address" })).rejects.toThrow("Refresh checkout")
    await expect(requestPaymentEmailVerification({ ...intent, items: [] })).rejects.toThrow("selection has changed")
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it("keeps cooldown and attempt details from server errors", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({
      error: "Please wait before requesting another payment code.", retryAfter: 43,
    }), { status: 429 }) } })
    await expect(requestPaymentEmailVerification(intent)).rejects.toMatchObject({ status: 429, retryAfter: 43 })

    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({
      error: "That code is incorrect.", attemptsRemaining: 3,
    }), { status: 400 }) } })
    await expect(confirmPaymentEmailVerification(challenge(), "012345")).rejects.toMatchObject({ attemptsRemaining: 3 })
  })

  it("confirms the challenge only for its original checkout", async () => {
    const expiresAt = new Date(Date.now() + 240_000).toISOString()
    mocks.invoke.mockResolvedValue({ data: {
      status: "authorized", authorizationId: challengeId, checkoutKey,
      paymentMethod: "gcash", expiresAt,
    }, error: null })
    await expect(confirmPaymentEmailVerification(challenge(), "012345")).resolves.toMatchObject({
      id: challengeId, checkoutKey, paymentMethod: "gcash",
    })
    expect(mocks.invoke).toHaveBeenCalledWith("verify-mobile-payment", expect.objectContaining({
      body: { action: "verify", challengeId, code: "012345" },
    }))
  })

  it("does not send incomplete or expired codes", async () => {
    await expect(confirmPaymentEmailVerification(challenge(), "12345")).rejects.toThrow("six-digit")
    await expect(confirmPaymentEmailVerification({ ...challenge(), expiresAt: Date.now() - 1 }, "012345")).rejects.toThrow("expired")
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it("rejects a success response for a different payment attempt", async () => {
    mocks.invoke.mockResolvedValue({ data: {
      status: "authorized", authorizationId: challengeId,
      checkoutKey: "1de8fe16-d2de-4913-8860-271b582fd126",
      paymentMethod: "gcash", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, error: null })
    await expect(confirmPaymentEmailVerification(challenge(), "012345")).rejects.toThrow("could not be confirmed")
  })
})

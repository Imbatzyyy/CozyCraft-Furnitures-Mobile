import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  confirmPhoneVerification, isSixDigitOtp, isVerifiedPhone, maskPhilippineMobile,
  normalizeOtp, normalizePhilippineMobile, requestPhoneVerification, secondsUntil,
  type PhoneChallenge,
} from "./phone-verification"

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn(), single: vi.fn(), from: vi.fn() }))
vi.mock("../../lib/supabase", () => ({ supabase: {
  functions: { invoke: mocks.invoke }, auth: { getSession: mocks.getSession }, from: mocks.from,
} }))

const challengeId = "22a0851f-a10f-4e42-b16d-963f558701aa"
const verifiedAt = "2026-08-27T12:00:00.000Z"
const phone = "+639171234567"
const makeChallenge = (): PhoneChallenge => ({
  id: challengeId, phone, maskedPhone: "+6391•••4567", expiresAt: Date.now() + 300_000, resendAvailableAt: Date.now() + 60_000,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: mocks.single }) }) })
})

describe("profile OTP contract", () => {
  it.each(["0917 123 4567", "0917-123-4567", "639171234567", "+639171234567", "(0917) 123.4567"])("normalizes %s", (input) => {
    expect(normalizePhilippineMobile(input)).toBe(phone)
  })
  it.each(["9171234567", "+6309171234567", "091712345", "hello", "+12025550123"])("rejects %s", (input) => {
    expect(normalizePhilippineMobile(input)).toBeNull()
  })
  it("preserves leading zeroes and normalizes pasted codes", () => {
    expect(normalizeOtp("０１２ ３４５")).toBe("012345")
    expect(isSixDigitOtp("012345")).toBe(true)
    expect(isSixDigitOtp("12345")).toBe(false)
    expect(isSixDigitOtp("12345a")).toBe(false)
  })
  it("only marks the matching persisted number as verified", () => {
    expect(isVerifiedPhone("0917 123 4567", phone, verifiedAt)).toBe(true)
    expect(isVerifiedPhone("0918 123 4567", phone, verifiedAt)).toBe(false)
    expect(isVerifiedPhone(phone, phone, null)).toBe(false)
    expect(isVerifiedPhone(phone, phone, "not a date")).toBe(false)
  })
  it("masks a number and derives timers from absolute deadlines", () => {
    expect(maskPhilippineMobile(phone)).toBe("+6391•••4567")
    expect(secondsUntil(61_000, 0)).toBe(61)
    expect(secondsUntil(61_000, 61_500)).toBe(0)
  })
  it("uses the website endpoint and bounded request timeout", async () => {
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    mocks.invoke.mockResolvedValue({ data: { status: "code_sent", challengeId, expiresAt, resendAfter: 60, maskedPhone: "+6391•••4567" }, error: null })
    const result = await requestPhoneVerification("0917 123 4567")
    expect(result.kind).toBe("challenge")
    expect(mocks.invoke).toHaveBeenCalledWith("verify-customer-phone", expect.objectContaining({
      body: { action: "request", phone }, timeout: 25_000,
    }))
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it("does not request an SMS for invalid input", async () => {
    await expect(requestPhoneVerification("09")).rejects.toThrow("valid Philippine")
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it("keeps the server cooldown and message from an HTTP error body", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "Wait before resending.", retryAfter: 43 }), { status: 429 }) } })
    await expect(requestPhoneVerification(phone)).rejects.toMatchObject({ status: 429, retryAfter: 43, message: "Wait before resending." })
  })
  it("reports a provider failure without claiming the number is verified", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "SMS verification is being configured." }), { status: 503 }) } })
    await expect(requestPhoneVerification(phone)).rejects.toThrow("SMS verification is being configured.")
  })
  it("fetches the actual timestamp for already-verified responses", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "already_verified", phone }, error: null })
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "customer-id" } } }, error: null })
    mocks.single.mockResolvedValue({ data: { phone, phone_verified_at: verifiedAt }, error: null })
    await expect(requestPhoneVerification(phone)).resolves.toEqual({ kind: "verified", verified: { phone, phoneVerifiedAt: verifiedAt } })
  })
  it("does not invent a verification timestamp when the saved snapshot is missing", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "already_verified", phone }, error: null })
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "customer-id" } } }, error: null })
    mocks.single.mockResolvedValue({ data: { phone, phone_verified_at: null }, error: null })
    await expect(requestPhoneVerification(phone)).rejects.toThrow("could not be refreshed")
  })
  it("requires an authoritative verified response for the exact challenged number", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "verified", phone, phoneVerifiedAt: verifiedAt }, error: null })
    await expect(confirmPhoneVerification(makeChallenge(), "012345")).resolves.toEqual({ phone, phoneVerifiedAt: verifiedAt })
    expect(mocks.invoke).toHaveBeenCalledWith("verify-customer-phone", expect.objectContaining({ body: { action: "verify", challengeId, code: "012345" } }))
    mocks.invoke.mockResolvedValue({ data: { status: "verified", phone: "+639181234567", phoneVerifiedAt: verifiedAt }, error: null })
    await expect(confirmPhoneVerification(makeChallenge(), "012345")).rejects.toThrow("could not be confirmed")
  })
  it("does not send a verify request for expired or incomplete codes", async () => {
    await expect(confirmPhoneVerification({ ...makeChallenge(), expiresAt: Date.now() - 1 }, "012345")).rejects.toThrow("expired")
    await expect(confirmPhoneVerification(makeChallenge(), "12345")).rejects.toThrow("six-digit")
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it("preserves the remaining-attempts lockout from the server", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "Too many incorrect attempts.", attemptsRemaining: 0 }), { status: 400 }) } })
    await expect(confirmPhoneVerification(makeChallenge(), "012345")).rejects.toMatchObject({ attemptsRemaining: 0 })
  })
  it("rejects incomplete success payloads", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "code_sent" }, error: null })
    await expect(requestPhoneVerification(phone)).rejects.toThrow("incomplete response")
  })
})

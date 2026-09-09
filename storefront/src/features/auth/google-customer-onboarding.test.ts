import type { User } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
const rpc = vi.hoisted(() => vi.fn())
vi.mock("../../lib/supabase", () => ({ supabase: { rpc } }))
import {
  emptyGoogleOnboardingStatus,
  isGoogleCustomer,
  parseGoogleOnboardingStatus,
  loadMobileGoogleOnboarding,
} from "./google-customer-onboarding"

const user = (app_metadata: Record<string, unknown>) => ({
  id: "7e9cffd3-bac9-48e3-a9c2-6a1c93fa1d47",
  app_metadata,
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-09-04T00:00:00.000Z",
} as User)

describe("Google customer onboarding data", () => {
  it("requests database welcome eligibility for email customers instead of returning empty status", async () => {
    const customer = user({ provider: "email", providers: ["email"] })
    rpc.mockResolvedValueOnce({ data: { userId: customer.id, isGoogle: false, showVoucher: true, voucher: { id: "issued", code: "WELCOME-TEST", discountAmount: 500, minimumOrderAmount: 5000, expiresAt: "2027-01-01" } }, error: null })
    const result = await loadMobileGoogleOnboarding(customer)
    expect(rpc).toHaveBeenCalledWith("get_mobile_customer_onboarding")
    expect(result.showVoucher).toBe(true)
    expect(result.needsUsername).toBe(false)
    expect(result.isGoogle).toBe(false)
  })
  it("does not fabricate a reward or swallow a failed email welcome lookup", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
    await expect(loadMobileGoogleOnboarding(user({ provider: "email" }))).rejects.toThrow("welcome reward")
  })
  it("recognizes primary and linked Google identities", () => {
    expect(isGoogleCustomer(user({ provider: "google" }))).toBe(true)
    expect(isGoogleCustomer(user({ provider: "email", providers: ["email", "google"] }))).toBe(true)
    expect(isGoogleCustomer(user({ provider: "email", providers: ["email"] }))).toBe(false)
  })

  it("parses a database-backed welcome voucher without trusting missing fields", () => {
    expect(parseGoogleOnboardingStatus({
      userId: "customer-id",
      isGoogle: true,
      needsUsername: false,
      username: "cozyhome",
      showVoucher: true,
      voucher: {
        id: "voucher-id",
        code: "WELCOME-A1B2C3D4",
        discountAmount: 500,
        minimumOrderAmount: 5000,
        expiresAt: "2026-10-04T00:00:00.000Z",
      },
    })).toEqual({
      userId: "customer-id",
      isGoogle: true,
      needsUsername: false,
      username: "cozyhome",
      showVoucher: true,
      voucher: {
        id: "voucher-id",
        code: "WELCOME-A1B2C3D4",
        discountAmount: 500,
        minimumOrderAmount: 5000,
        expiresAt: "2026-10-04T00:00:00.000Z",
      },
    })
  })

  it("never opens an incomplete voucher returned by the network", () => {
    const status = parseGoogleOnboardingStatus({ showVoucher: true, voucher: null }, "customer-id")
    expect(status.showVoucher).toBe(false)
    expect(status.voucher).toBeNull()
  })

  it("creates a non-blocking state for ordinary email customers", () => {
    expect(emptyGoogleOnboardingStatus("email-customer")).toEqual({
      userId: "email-customer",
      isGoogle: false,
      needsUsername: false,
      username: "",
      showVoucher: false,
      voucher: null,
    })
  })
})

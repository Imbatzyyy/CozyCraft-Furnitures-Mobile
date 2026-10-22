import { describe, expect, it } from "vitest"
import { isMobileRewardEligible, mobileRewardMinimumOrder } from "./mobile-data"

describe("mobile reward checkout eligibility", () => {
  it("rejects expired and already-applied vouchers during an open checkout", () => {
    const now = Date.parse("2026-10-22T00:00:00Z")
    const reward = { minimum_order_amount: 5000, status: "available" as const, expires_at: "2026-10-22T00:00:00Z" }
    expect(isMobileRewardEligible(reward, 10000, now - 1)).toBe(true)
    expect(isMobileRewardEligible(reward, 10000, now)).toBe(false)
    expect(isMobileRewardEligible({ ...reward, status: "applied" }, 10000, now - 1)).toBe(false)
    expect(isMobileRewardEligible({ ...reward, expires_at: "invalid" }, 10000, now - 1)).toBe(false)
  })
  it("enforces a welcome reward against merchandise subtotal", () => {
    const reward = { minimum_order_amount: 5000 }
    expect(isMobileRewardEligible(reward, 4999)).toBe(false)
    expect(isMobileRewardEligible(reward, 5000)).toBe(true)
  })

  it("keeps ordinary points rewards compatible with a zero minimum", () => {
    const reward = { minimum_order_amount: 0 }
    expect(mobileRewardMinimumOrder(reward)).toBe(0)
    expect(isMobileRewardEligible(reward, 1)).toBe(true)
  })
})

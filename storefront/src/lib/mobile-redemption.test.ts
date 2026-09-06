import { describe, expect, it } from "vitest"
import { isMobileRewardEligible, mobileRewardMinimumOrder } from "./mobile-data"

describe("mobile reward checkout eligibility", () => {
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

import { describe, expect, it } from "vitest"
import { mobileCartStockStatus } from "./mobile-cart-stock"

describe("mobile cart stock status", () => {
  it("allows quantities below the available stock", () => {
    expect(mobileCartStockStatus(8, 7)).toEqual({
      availableStock: 8,
      maxReached: false,
      outOfStock: false,
      exceedsStock: false,
      canIncrease: true,
    })
  })

  it("stops increasing at the exact stock limit", () => {
    expect(mobileCartStockStatus(8, 8)).toEqual({
      availableStock: 8,
      maxReached: true,
      outOfStock: false,
      exceedsStock: false,
      canIncrease: false,
    })
  })

  it("flags a cart line that became larger than live stock", () => {
    expect(mobileCartStockStatus(3, 4)).toEqual({
      availableStock: 3,
      maxReached: true,
      outOfStock: false,
      exceedsStock: true,
      canIncrease: false,
    })
  })

  it("treats zero stock as unavailable and preserves unknown-stock fallback", () => {
    expect(mobileCartStockStatus(0, 1).outOfStock).toBe(true)
    expect(mobileCartStockStatus(undefined, 98).canIncrease).toBe(true)
    expect(mobileCartStockStatus(undefined, 99).canIncrease).toBe(false)
  })
})

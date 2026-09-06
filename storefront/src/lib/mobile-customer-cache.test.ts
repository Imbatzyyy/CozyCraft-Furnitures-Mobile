import { beforeEach, describe, expect, it } from "vitest"
import {
  clearMobileCustomerCache,
  mobileCustomerCacheOwner,
  rememberMobileCustomerCacheOwner,
} from "./supabase"

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

const accountKeys = [
  "cozycraft-saved",
  "cozycraft-bag",
  "cozycraft-orders",
  "cozycraft-profile",
  "cozycraft-recently-viewed",
  "cozycraft-pending-payment",
  "cozycraft-last-payment-callback",
  "cozycraft-last-presented-payment-order",
  "cozycraft-storefront-return-state",
]

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() })
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: memoryStorage() })
})

describe("mobile customer cache ownership", () => {
  it("remembers the account that owns the cached customer snapshot", () => {
    rememberMobileCustomerCacheOwner("customer-a")
    expect(mobileCustomerCacheOwner()).toBe("customer-a")
  })

  it("removes every account-scoped snapshot before another customer signs in", () => {
    accountKeys.forEach((key) => window.localStorage.setItem(key, "private customer data"))
    window.sessionStorage.setItem("cozycraft-profile-avatar-url-v1", "signed avatar")
    rememberMobileCustomerCacheOwner("customer-a")

    clearMobileCustomerCache()

    accountKeys.forEach((key) => expect(window.localStorage.getItem(key)).toBeNull())
    expect(mobileCustomerCacheOwner()).toBe("")
    expect(window.sessionStorage.getItem("cozycraft-profile-avatar-url-v1")).toBeNull()
  })
})

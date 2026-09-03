import { describe, expect, it, vi } from "vitest"
import {
  clearStorefrontReturnState,
  hasStorefrontReturnState,
  isMobileContentDocumentRoute,
  mobileShellBackAction,
  notificationBadgeCount,
  readStorefrontReturnState,
  rememberStorefrontReturnState,
} from "./mobile-navigation"

function storageDouble() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
}

describe("mobile content-page return navigation", () => {
  it("restores the account tab and its previous scroll position once", () => {
    const storage = storageDouble()
    rememberStorefrontReturnState(428.4, 7, storage)
    expect(hasStorefrontReturnState(storage)).toBe(true)
    expect(readStorefrontReturnState(storage)).toEqual({ tab: "account", scrollTop: 428, unreadNotifications: 7 })
    expect(readStorefrontReturnState(storage)).toEqual({ tab: "account", scrollTop: 428, unreadNotifications: 7 })
    clearStorefrontReturnState(storage)
    expect(readStorefrontReturnState(storage)).toBeNull()
  })

  it("sanitizes unusable scroll positions", () => {
    const storage = storageDouble()
    rememberStorefrontReturnState(Number.NaN, Number.NaN, storage)
    expect(readStorefrontReturnState(storage)).toEqual({ tab: "account", scrollTop: 0, unreadNotifications: 0 })
  })

  it("keeps an older return marker compatible when it has no notification count", () => {
    const storage = storageDouble()
    storage.setItem("cozycraft-storefront-return-state", JSON.stringify({ tab: "account", scrollTop: 21 }))
    expect(readStorefrontReturnState(storage)).toEqual({ tab: "account", scrollTop: 21, unreadNotifications: 0 })
  })

  it("holds the previous notification badge until the live list is hydrated", () => {
    const returnState = { tab: "account" as const, scrollTop: 428, unreadNotifications: 7 }
    expect(notificationBadgeCount(0, false, returnState)).toBe(7)
    expect(notificationBadgeCount(7, true, returnState)).toBe(7)
    expect(notificationBadgeCount(0, true, returnState)).toBe(0)
    expect(notificationBadgeCount(4, false, null)).toBe(4)
  })

  it("identifies only the four shared content-document routes", () => {
    expect(isMobileContentDocumentRoute("#/about")).toBe(true)
    expect(isMobileContentDocumentRoute("#/contact")).toBe(true)
    expect(isMobileContentDocumentRoute("#/terms")).toBe(true)
    expect(isMobileContentDocumentRoute("#/privacy-policy")).toBe(true)
    expect(isMobileContentDocumentRoute("#/shop")).toBe(false)
  })

  it("returns a signed-in content page to browser history instead of Welcome", () => {
    expect(mobileShellBackAction("#/about", true)).toBe("history")
    expect(mobileShellBackAction("#/privacy-policy", true)).toBe("history")
    expect(mobileShellBackAction("#/terms", false)).toBe("welcome")
    expect(mobileShellBackAction("#/shop", false)).toBe("storefront")
  })
})

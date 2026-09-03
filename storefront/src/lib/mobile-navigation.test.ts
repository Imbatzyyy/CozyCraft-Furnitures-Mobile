import { describe, expect, it, vi } from "vitest"
import {
  clearStorefrontReturnState,
  hasStorefrontReturnState,
  isMobileContentDocumentRoute,
  mobileShellBackAction,
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
    rememberStorefrontReturnState(428.4, storage)
    expect(hasStorefrontReturnState(storage)).toBe(true)
    expect(readStorefrontReturnState(storage)).toEqual({ tab: "account", scrollTop: 428 })
    expect(readStorefrontReturnState(storage)).toEqual({ tab: "account", scrollTop: 428 })
    clearStorefrontReturnState(storage)
    expect(readStorefrontReturnState(storage)).toBeNull()
  })

  it("sanitizes unusable scroll positions", () => {
    const storage = storageDouble()
    rememberStorefrontReturnState(Number.NaN, storage)
    expect(readStorefrontReturnState(storage)).toEqual({ tab: "account", scrollTop: 0 })
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

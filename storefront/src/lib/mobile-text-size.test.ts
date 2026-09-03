import { describe, expect, it, vi } from "vitest"
import {
  applyMobileTextSize,
  DEFAULT_MOBILE_TEXT_SIZE,
  MOBILE_TEXT_SIZE_STORAGE_KEY,
  mobileTextSizeScale,
  readMobileTextSize,
  saveMobileTextSize,
} from "./mobile-text-size"

describe("mobile text-size preference", () => {
  it("uses the more readable Comfortable size by default", () => {
    const storage = { getItem: vi.fn(() => null) }
    expect(readMobileTextSize(storage)).toBe(DEFAULT_MOBILE_TEXT_SIZE)
    expect(DEFAULT_MOBILE_TEXT_SIZE).toBe("comfortable")
    expect(mobileTextSizeScale(DEFAULT_MOBILE_TEXT_SIZE)).toBe(1.15)
  })

  it("restores a saved valid size and ignores an invalid value", () => {
    expect(readMobileTextSize({ getItem: () => "large" })).toBe("large")
    expect(readMobileTextSize({ getItem: () => "oversized" })).toBe("comfortable")
  })

  it("applies the scale without resizing the page itself", () => {
    applyMobileTextSize("extra-large", document.documentElement)
    expect(document.documentElement.dataset.cozyTextSize).toBe("extra-large")
    expect(document.documentElement.style.getPropertyValue("--cozy-font-scale")).toBe("1.4")
  })

  it("persists a choice and applies it immediately", () => {
    const storage = { setItem: vi.fn() }
    saveMobileTextSize("standard", storage)
    expect(storage.setItem).toHaveBeenCalledWith(MOBILE_TEXT_SIZE_STORAGE_KEY, "standard")
    expect(document.documentElement.style.getPropertyValue("--cozy-font-scale")).toBe("1")
  })
})

import { describe, expect, it, vi } from "vitest"
import {
  MOBILE_PUSH_PERMISSION_STORAGE_KEY,
  normalizeMobilePushPermission,
  readMobilePushPermission,
  saveMobilePushPermission,
} from "./mobile-push-permission"

function storageDouble(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(MOBILE_PUSH_PERMISSION_STORAGE_KEY, initial)
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
  }
}

describe("mobile push-permission display state", () => {
  it("restores a granted device permission without showing the opt-in again", () => {
    const storage = storageDouble("granted")
    expect(readMobilePushPermission(storage)).toBe("granted")
  })

  it("does not trust stale or malformed cached values", () => {
    expect(normalizeMobilePushPermission("prompt")).toBe("unknown")
    expect(readMobilePushPermission(storageDouble("enabled"))).toBe("unknown")
  })

  it("persists the latest status reported by the native operating system", () => {
    const storage = storageDouble()
    saveMobilePushPermission("denied", storage)
    expect(readMobilePushPermission(storage)).toBe("denied")
  })
})

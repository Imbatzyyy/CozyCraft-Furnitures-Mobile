import { afterEach, expect, it, vi } from "vitest"
import { scheduleSnapshot } from "./snapshot-write"
import { localStore } from "./browser-storage"
afterEach(() => { vi.useRealTimers(); localStore.removeItem("qa-snapshot") })
it("defers serialization and cancels superseded snapshots", () => {
  vi.useFakeTimers()
  const value = { toJSON: vi.fn(() => "new") }
  const cancel = scheduleSnapshot("qa-snapshot", value, () => true)
  expect(value.toJSON).not.toHaveBeenCalled()
  cancel()
  vi.runAllTimers()
  expect(value.toJSON).not.toHaveBeenCalled()
})
it("never resurrects a signed-out account snapshot", () => {
  vi.useFakeTimers()
  let owner = true
  const cancel = scheduleSnapshot("qa-snapshot", ["old-customer"], () => owner)
  owner = false
  window.dispatchEvent(new Event("pagehide"))
  vi.runAllTimers()
  expect(localStore.getItem("qa-snapshot")).toBeNull()
  cancel()
})
it("flushes the current snapshot on backgrounding", () => {
  vi.useFakeTimers()
  const cancel = scheduleSnapshot("qa-snapshot", ["current"], () => true)
  window.dispatchEvent(new Event("pagehide"))
  expect(localStore.getItem("qa-snapshot")).toBe('["current"]')
  cancel()
})

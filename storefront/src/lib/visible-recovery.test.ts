import { afterEach, expect, it, vi } from "vitest"
import { watchVisibleRecovery } from "./visible-recovery"
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it("coalesces focus/native/visibility and never runs on a background timer", () => {
  vi.useFakeTimers()
  const recover = vi.fn()
  const watcher = watchVisibleRecovery(recover)
  vi.advanceTimersByTime(31_000)
  expect(recover).not.toHaveBeenCalled()
  window.dispatchEvent(new Event("focus"))
  document.dispatchEvent(new Event("visibilitychange"))
  window.dispatchEvent(new MessageEvent("message", { source: window.parent, data: { type: "cozycraft-native-app-active" } }))
  expect(recover).toHaveBeenCalledTimes(1)
  watcher.dispose()
  window.dispatchEvent(new Event("online"))
  expect(recover).toHaveBeenCalledTimes(1)
})
it("remembers invalidation while hidden and ignores untrusted native messages", () => {
  vi.useFakeTimers()
  let hidden = true
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden)
  const recover = vi.fn(), watcher = watchVisibleRecovery(recover)
  watcher.invalidate()
  expect(recover).not.toHaveBeenCalled()
  hidden = false
  document.dispatchEvent(new Event("visibilitychange"))
  expect(recover).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(31_000)
  window.dispatchEvent(new MessageEvent("message", { source: null, data: { type: "cozycraft-native-app-active" } }))
  expect(recover).toHaveBeenCalledTimes(1)
  watcher.dispose()
})

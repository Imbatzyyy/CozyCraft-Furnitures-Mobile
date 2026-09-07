import { act, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import useVisibleInterval from "./useVisibleInterval"

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it("stops background ticks, resumes without catch-up and cleans up", () => {
  vi.useFakeTimers()
  let hidden = false
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden)
  const tick = vi.fn()
  const { unmount } = renderHook(() => useVisibleInterval(tick, 1000))
  act(() => { vi.advanceTimersByTime(1000) })
  expect(tick).toHaveBeenCalledTimes(1)
  act(() => { hidden = true; document.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(10000) })
  expect(tick).toHaveBeenCalledTimes(1)
  act(() => { hidden = false; document.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(1000) })
  expect(tick).toHaveBeenCalledTimes(2)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it("uses current callbacks, refreshes clocks on return, and supports disabled intervals", () => {
  vi.useFakeTimers()
  let hidden = true
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden)
  const first = vi.fn(), next = vi.fn()
  const { rerender, unmount } = renderHook(({ callback, delay }) => useVisibleInterval(callback, delay, true), { initialProps: { callback: first, delay: 1000 as number | null } })
  expect(first).not.toHaveBeenCalled()
  rerender({ callback: next, delay: 1000 })
  act(() => { hidden = false; document.dispatchEvent(new Event("visibilitychange")) })
  expect(next).toHaveBeenCalledTimes(1)
  rerender({ callback: next, delay: null })
  expect(vi.getTimerCount()).toBe(0)
  unmount()
})

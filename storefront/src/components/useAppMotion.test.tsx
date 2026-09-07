import { act, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import useAppMotion from "./useAppMotion"
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it("keeps standard effects on capable devices and reacts to Data Saver and visibility", () => {
  const connection = Object.assign(new EventTarget(), { saveData: false })
  vi.stubGlobal("navigator", { hardwareConcurrency: 12, deviceMemory: 8, connection })
  let hidden = false
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden)
  const { unmount } = renderHook(useAppMotion)
  expect(document.documentElement.dataset.cozyMotion).toBe("standard")
  act(() => { connection.saveData = true; connection.dispatchEvent(new Event("change")) })
  expect(document.documentElement.dataset.cozyMotion).toBe("economy")
  act(() => { hidden = true; document.dispatchEvent(new Event("visibilitychange")) })
  expect(document.documentElement.dataset.cozyMotion).toBe("paused")
  act(() => { hidden = false; connection.saveData = false; document.dispatchEvent(new Event("visibilitychange")) })
  expect(document.documentElement.dataset.cozyMotion).toBe("standard")
  unmount()
  expect(document.documentElement.dataset.cozyMotion).toBeUndefined()
})
it("uses economy for constrained hardware and standard when hints are unavailable", () => {
  vi.stubGlobal("navigator", { hardwareConcurrency: 4 })
  const first = renderHook(useAppMotion)
  expect(document.documentElement.dataset.cozyMotion).toBe("economy")
  first.unmount()
  vi.stubGlobal("navigator", {})
  const next = renderHook(useAppMotion)
  expect(document.documentElement.dataset.cozyMotion).toBe("standard")
  next.unmount()
})

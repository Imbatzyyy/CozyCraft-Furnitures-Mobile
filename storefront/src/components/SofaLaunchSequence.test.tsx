import { StrictMode } from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import SofaLaunchSequence, { QUICK_SOFA_LAUNCH_DURATION_MS, QUICK_SOFA_TRANSITION_DURATION_MS, SOFA_LAUNCH_DURATION_MS, SOFA_TRANSITION_DURATION_MS } from "./SofaLaunchSequence"
import CozyLaunchScreen from "./CozyLaunchScreen"
import { clearLaunchHandoff, hasLaunchHandoff, LAUNCH_SEEN_KEY, readLaunchPace } from "./launch-handoff"
import { localStore } from "../lib/browser-storage"

afterEach(() => { vi.useRealTimers(); clearLaunchHandoff(); localStore.removeItem(LAUNCH_SEEN_KEY) })

it("runs once, holds the finished sofa for one second, then completes", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<StrictMode><SofaLaunchSequence onComplete={complete} /></StrictMode>)
  expect(screen.getByRole("status").textContent).toContain("Preparing your home")
  expect(document.querySelector(".cozy-launch-screen--animated")).toBeTruthy()
  act(() => vi.advanceTimersByTime(SOFA_LAUNCH_DURATION_MS - 1))
  expect(complete).not.toHaveBeenCalled()
  expect(document.querySelector(".cozy-launch-screen--exiting")).toBeNull()
  view.rerender(<StrictMode><SofaLaunchSequence onComplete={complete} /></StrictMode>)
  act(() => vi.advanceTimersByTime(1))
  expect(document.querySelector(".cozy-launch-screen--exiting")).toBeTruthy()
  act(() => vi.advanceTimersByTime(SOFA_TRANSITION_DURATION_MS - 1))
  expect(complete).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(complete).toHaveBeenCalledTimes(1)
  expect(hasLaunchHandoff()).toBe(true)
  act(() => vi.advanceTimersByTime(SOFA_TRANSITION_DURATION_MS))
  expect(complete).toHaveBeenCalledTimes(1)
})

it("marks later preparation screens as static so the launch cycle cannot restart", async () => {
  const view = render(<CozyLaunchScreen handoff label="Opening CozyCraft…" />)
  expect(document.querySelector(".cozy-launch-screen--animated")).toBeNull()
  expect(document.querySelector(".cozy-launch-screen--handoff")).toBeTruthy()
  expect(document.querySelector(".cozy-loader")).toBeNull()
  expect(document.querySelector(".cozy-launch-screen")).toBeTruthy()
  view.unmount()
})

it("waits for the preloaded home before starting the exit transition", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<SofaLaunchSequence homeReady={false} onComplete={complete} />)
  act(() => vi.advanceTimersByTime(SOFA_LAUNCH_DURATION_MS))
  expect(document.querySelector(".cozy-launch-screen--exiting")).toBeNull()
  view.rerender(<SofaLaunchSequence homeReady onComplete={complete} />)
  expect(document.querySelector(".cozy-launch-screen--exiting")).toBeTruthy()
  act(() => vi.advanceTimersByTime(SOFA_TRANSITION_DURATION_MS))
  expect(complete).toHaveBeenCalledTimes(1)
})

it("cancels navigation when the launch screen is unmounted", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<SofaLaunchSequence onComplete={complete} />)
  view.unmount()
  act(() => vi.advanceTimersByTime(SOFA_LAUNCH_DURATION_MS + SOFA_TRANSITION_DURATION_MS))
  expect(complete).not.toHaveBeenCalled()
})

it("plays in full once, then gives returning launches the compressed drawing", () => {
  vi.useFakeTimers()
  expect(readLaunchPace()).toBe("full")
  const first = vi.fn()
  const view = render(<SofaLaunchSequence onComplete={first} />)
  act(() => vi.advanceTimersByTime(SOFA_LAUNCH_DURATION_MS))
  expect(readLaunchPace()).toBe("full")
  act(() => vi.advanceTimersByTime(SOFA_TRANSITION_DURATION_MS))
  expect(first).toHaveBeenCalledTimes(1)
  expect(readLaunchPace()).toBe("quick")
  view.unmount()

  const again = vi.fn()
  render(<SofaLaunchSequence onComplete={again} pace="quick" />)
  expect(document.querySelector(".cozy-launch-screen--quick")).toBeTruthy()
  act(() => vi.advanceTimersByTime(QUICK_SOFA_LAUNCH_DURATION_MS))
  expect(document.querySelector(".cozy-launch-screen--exiting")).toBeTruthy()
  act(() => vi.advanceTimersByTime(QUICK_SOFA_TRANSITION_DURATION_MS))
  expect(again).toHaveBeenCalledTimes(1)
})

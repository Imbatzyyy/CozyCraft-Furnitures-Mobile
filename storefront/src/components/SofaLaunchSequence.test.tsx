import { StrictMode } from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import SofaLaunchSequence, { SOFA_LAUNCH_DURATION_MS, SOFA_TRANSITION_DURATION_MS } from "./SofaLaunchSequence"
import CozyLaunchScreen from "./CozyLaunchScreen"
import { clearLaunchHandoff, hasLaunchHandoff } from "./launch-handoff"

afterEach(() => { vi.useRealTimers(); clearLaunchHandoff() })

it("runs once, holds the finished sofa for two seconds, then completes", () => {
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

it("cancels navigation when the launch screen is unmounted", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<SofaLaunchSequence onComplete={complete} />)
  view.unmount()
  act(() => vi.advanceTimersByTime(SOFA_LAUNCH_DURATION_MS + SOFA_TRANSITION_DURATION_MS))
  expect(complete).not.toHaveBeenCalled()
})

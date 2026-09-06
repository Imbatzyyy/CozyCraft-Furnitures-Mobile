import { StrictMode } from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import SofaLaunchSequence from "./SofaLaunchSequence"

afterEach(() => vi.useRealTimers())

it("runs once, holds the finished sofa for two seconds, then completes", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<StrictMode><SofaLaunchSequence onComplete={complete} /></StrictMode>)
  expect(screen.getByRole("status").textContent).toContain("Preparing your home")
  expect(document.querySelector(".cozy-launch-screen--animated")).toBeTruthy()
  act(() => vi.advanceTimersByTime(6999))
  expect(complete).not.toHaveBeenCalled()
  view.rerender(<StrictMode><SofaLaunchSequence onComplete={complete} /></StrictMode>)
  act(() => vi.advanceTimersByTime(1))
  expect(complete).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(7000))
  expect(complete).toHaveBeenCalledTimes(1)
})

it("marks later preparation screens as static so the launch cycle cannot restart", async () => {
  const { default: CozyLaunchScreen } = await import("./CozyLaunchScreen")
  const view = render(<CozyLaunchScreen />)
  expect(document.querySelector(".cozy-launch-screen--animated")).toBeNull()
  expect(document.querySelector(".cozy-launch-screen")).toBeTruthy()
  view.unmount()
})

it("cancels navigation when the launch screen is unmounted", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<SofaLaunchSequence onComplete={complete} />)
  view.unmount()
  act(() => vi.advanceTimersByTime(7000))
  expect(complete).not.toHaveBeenCalled()
})

import { StrictMode } from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import SofaLaunchSequence from "./SofaLaunchSequence"

afterEach(() => vi.useRealTimers())

it("keeps the sofa visible for five seconds and completes only once in StrictMode", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<StrictMode><SofaLaunchSequence onComplete={complete} /></StrictMode>)
  expect(screen.getByRole("status").textContent).toContain("Preparing your home")
  act(() => vi.advanceTimersByTime(4999))
  expect(complete).not.toHaveBeenCalled()
  view.rerender(<StrictMode><SofaLaunchSequence onComplete={complete} /></StrictMode>)
  act(() => vi.advanceTimersByTime(1))
  expect(complete).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(5000))
  expect(complete).toHaveBeenCalledTimes(1)
})

it("cancels navigation when the launch screen is unmounted", () => {
  vi.useFakeTimers()
  const complete = vi.fn()
  const view = render(<SofaLaunchSequence onComplete={complete} />)
  view.unmount()
  act(() => vi.advanceTimersByTime(5000))
  expect(complete).not.toHaveBeenCalled()
})

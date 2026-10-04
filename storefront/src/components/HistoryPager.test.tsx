import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import HistoryPager from "./HistoryPager"

it("returns to the last available page when records are removed", () => {
  const change = vi.fn()
  const { rerender } = render(<HistoryPager page={3} total={12} change={change}/>)
  expect(change).not.toHaveBeenCalled()
  rerender(<HistoryPager page={3} total={10} change={change}/>)
  expect(change).toHaveBeenCalledWith(2)
})

it("does not reset a requested page using the previous total while loading", () => {
  const change = vi.fn()
  const { rerender } = render(<HistoryPager page={2} total={0} busy change={change}/>)
  expect(change).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: /Previous/ }).hasAttribute("disabled")).toBe(true)
  rerender(<HistoryPager page={2} total={0} busy={false} change={change}/>)
  expect(change).toHaveBeenCalledWith(1)
})

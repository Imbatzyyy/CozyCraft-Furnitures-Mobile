import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import ProfileHomeCircle from "./ProfileHomeCircle"
afterEach(cleanup)
it("shows the real balance, normalized tier, and opens membership", () => {
  const open = vi.fn()
  render(<ProfileHomeCircle points={8115} tier="elite" lifetimeSpend={140000} open={open}/>)
  expect(screen.getByText("8,115")).toBeTruthy()
  expect(screen.getByText("Cozy Elite")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Open Home Circle points and rewards" }))
  expect(open).toHaveBeenCalledOnce()
})
it("shows the exact remaining spend for the next tier", () => {
  render(<ProfileHomeCircle points={120} tier="member" lifetimeSpend={12400} open={() => {}}/>)
  expect(screen.getByText("₱2,600 in eligible deliveries to Cozy Plus.")).toBeTruthy()
})

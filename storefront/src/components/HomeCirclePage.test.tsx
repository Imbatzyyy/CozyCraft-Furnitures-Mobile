import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import HomeCirclePage from "./HomeCirclePage"
import { homeCircleTier, rewardState } from "../lib/home-circle"

afterEach(cleanup)
const props = { points: 650, tier: "member", lifetimeSpend: 1000, orderCount: 1, activity: [], redemptions: [], close: vi.fn(), shop: vi.fn(), redeem: vi.fn(async () => {}) }
describe("Home Circle", () => {
  it("normalizes stable database keys and previous labels", () => {
    for (const name of ["member", "Member", "Cozy Member", "Cozy Nest", undefined]) expect(homeCircleTier(name).name).toBe("Cozy Nest")
    expect(homeCircleTier("premium").name).toBe("Cozy Premium")
    expect(homeCircleTier("Cozy Elite").key).toBe("elite")
  })
  it("expires a stale available reward without waiting for a database update", () => {
    expect(rewardState({ status: "available", expires_at: "2020-01-01" })).toBe("expired")
    expect(rewardState({ status: "used", expires_at: "2020-01-01" })).toBe("used")
  })
  it("requires confirmation and prevents duplicate reward requests", async () => {
    let finish!: () => void
    const redeem = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    render(<HomeCirclePage {...props} redeem={redeem}/>)
    fireEvent.click(screen.getByRole("button", { name: "Exchange 100 points for ₱100 reward" }))
    expect(redeem).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm · 100 points" }))
    fireEvent.click(screen.getByRole("button", { name: "Creating reward…" }))
    expect(redeem).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("₱100 reward added"))
  })
  it("preserves the selection and explains a failed exchange", async () => {
    render(<HomeCirclePage {...props} redeem={async () => { throw new Error("Not enough points") }}/>)
    fireEvent.click(screen.getByRole("button", { name: "Exchange 100 points for ₱100 reward" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm · 100 points" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Not enough points"))
    expect(screen.getByRole("button", { name: "Confirm · 100 points" })).toBeTruthy()
  })
  it("disables unaffordable and unsynced exchanges", () => {
    const { rerender } = render(<HomeCirclePage {...props} points={0}/>)
    expect((screen.getByRole("button", { name: "Exchange 100 points for ₱100 reward" }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<HomeCirclePage {...props} ready={false}/>)
    expect((screen.getByRole("button", { name: "Exchange 100 points for ₱100 reward" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

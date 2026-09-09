import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import HomeCirclePage from "./HomeCirclePage"
import { homeCircleTier, rewardState } from "../lib/home-circle"

afterEach(cleanup)
const props = { points: 650, tier: "member", lifetimeSpend: 1000, orderCount: 1, activity: [], redemptions: [], close: vi.fn(), shop: vi.fn(), redeem: vi.fn(async () => {}) }
describe("Home Circle", () => {
  it("celebrates only a confirmed upward tier change, not initial loading or reopening", () => {
    const { rerender } = render(<HomeCirclePage {...props} tier="plus" />)
    expect(screen.queryByRole("img", { name: /companion/ })).toBeNull()
    rerender(<HomeCirclePage {...props} tier="premium" ready={false} />)
    expect(screen.queryByRole("img", { name: /companion/ })).toBeNull()
    rerender(<HomeCirclePage {...props} tier="premium" ready />)
    expect(screen.getByRole("img", { name: /celebrating/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss celebration" }))
    rerender(<HomeCirclePage {...props} tier="premium" />)
    expect(screen.queryByRole("img", { name: /companion/ })).toBeNull()
  })
  it("paginates five activities and clamps the page when records disappear", () => {
    const activity = Array.from({ length: 12 }, (_, i) => ({ id: String(i), description: `Activity ${i}`, points: 10, created_at: "2026-09-01" }))
    const { rerender } = render(<HomeCirclePage {...props} activity={activity}/>)
    expect(screen.getAllByRole("listitem").filter(el => el.parentElement?.className === "hc-ledger")).toHaveLength(5)
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Activity 5")).toBeTruthy()
    expect(screen.queryByText("Activity 0")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Page 3 of 3")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Previous" }))
    expect(screen.getByText("Page 2 of 3")).toBeTruthy()
    rerender(<HomeCirclePage {...props} activity={activity.slice(0, 2)}/>)
    expect(screen.getByText("Activity 0")).toBeTruthy()
    expect(screen.queryByRole("navigation", { name: "Recent activity pages" })).toBeNull()
  })
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

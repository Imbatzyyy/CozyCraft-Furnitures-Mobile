import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock("../lib/supabase", () => ({ supabase: { auth } }))
import WelcomeTour from "./WelcomeTour"
let sequence = 0
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() })
  auth.updateUser.mockResolvedValue({ error: null })
})
function setup(metadata: Record<string, unknown> = { cozy_tour_pending_v1: true }, blocked = false) {
  const userId = `tour-${++sequence}`
  auth.getUser.mockResolvedValue({ data: { user: { id: userId, user_metadata: metadata } } })
  return { userId, ...render(<WelcomeTour userId={userId} blocked={blocked} />) }
}
describe("welcome tour", () => {
  it("does not show for an existing account without a pending tour", async () => {
    setup({}); await waitFor(() => expect(auth.getUser).toHaveBeenCalled())
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("waits behind the voucher, then offers an optional tour", async () => {
    const view = setup(undefined, true)
    await waitFor(() => expect(auth.getUser).toHaveBeenCalled())
    expect(screen.queryByRole("dialog")).toBeNull()
    view.rerender(<WelcomeTour userId={view.userId} blocked={false} />)
    await screen.findByText("Welcome home.")
    fireEvent.click(screen.getByText("Show me around"))
    expect(screen.getByText("Discover your cozy.")).toBeTruthy()
    fireEvent.click(screen.getByText("Next")); fireEvent.click(screen.getByText("Back"))
    expect(screen.getByText("Discover your cozy.")).toBeTruthy()
    fireEvent.click(screen.getByText("Skip tour"))
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ data: { cozy_tour_completed_v1: true, cozy_tour_pending_v1: false } }))
  })
  it("allows replay and Escape without blocking the app afterward", async () => {
    setup({ cozy_tour_completed_v1: true })
    fireEvent(window, new Event("cozycraft-replay-tour"))
    await screen.findByRole("dialog")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

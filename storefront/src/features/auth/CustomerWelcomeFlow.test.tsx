import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock("../../lib/supabase", () => ({ supabase: { auth } }))
import CustomerWelcomeFlow from "./CustomerWelcomeFlow"
import type { MobileGoogleOnboardingStatus } from "./google-customer-onboarding"
let sequence = 0
function fixture(fail = false) {
  const id = `flow-${++sequence}`
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() })
  auth.getUser.mockImplementation(async () => fail ? { data: { user: null }, error: new Error("offline") } : { data: { user: { id, user_metadata: {} } } })
  auth.updateUser.mockResolvedValue({ error: null })
  const status: MobileGoogleOnboardingStatus = { userId: id, isGoogle: true, username: "alex.home", needsUsername: false, showVoucher: true, voucher: { id: "real-issued-fixture", code: "WELCOME-FIXTURE", discountAmount: 500, minimumOrderAmount: 5000, expiresAt: "2027-01-01" } }
  const dismissVoucher = vi.fn().mockResolvedValue(undefined)
  return { id, status, dismissVoucher, complete: vi.fn(), startShopping: vi.fn() }
}
describe("Google signup welcome sequence", () => {
  it("shows the tour before the issued voucher and hands off on Finish", async () => {
    const f = fixture()
    render(<CustomerWelcomeFlow userId={f.id} {...f} blocked={false} displayName="Alex Rivera" />)
    await screen.findByText("Welcome home.")
    expect(screen.queryByText("WELCOME-FIXTURE")).toBeNull()
    fireEvent.click(screen.getByText("Show me around"))
    for (let n = 0; n < 3; n++) fireEvent.click(screen.getByText("Next"))
    fireEvent.click(screen.getByText("Finish"))
    await screen.findByText("WELCOME-FIXTURE")
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(screen.getByAltText("CozyCraft companion presenting your welcome voucher")).toBeTruthy()
    expect(f.dismissVoucher).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Keep it for later"))
    await waitFor(() => expect(f.dismissVoucher).toHaveBeenCalledTimes(1))
  })
  it("still opens for a new Google account when metadata lookup fails; Skip shows voucher", async () => {
    const f = fixture(true)
    render(<CustomerWelcomeFlow userId={f.id} {...f} blocked={false} displayName="Alex Rivera" />)
    await screen.findByText("Welcome home.")
    fireEvent.click(screen.getByText("Skip tour"))
    await screen.findByText("WELCOME-FIXTURE")
    expect(f.dismissVoucher).not.toHaveBeenCalled()
  })
  it("waits for Google username setup before starting the tutorial", async () => {
    const f = fixture()
    const view = render(<CustomerWelcomeFlow userId={f.id} {...f} status={{ ...f.status, needsUsername: true, username: "", showVoucher: false }} blocked={false} displayName="Alex Rivera" />)
    await screen.findByText("A warm welcome.")
    expect(screen.queryByText("Welcome home.")).toBeNull()
    view.rerender(<CustomerWelcomeFlow userId={f.id} {...f} blocked={false} displayName="Alex Rivera" />)
    await screen.findByText("Welcome home.")
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
  })
})

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
  it("does not unmount or reset setup during temporary missing account snapshots", async () => {
    const f = fixture()
    const props = { ...f, userId: f.id, blocked: false, displayName: "Prince Balane" }
    const status = { ...f.status, needsUsername: true, username: "", showVoucher: false }
    const view = render(<CustomerWelcomeFlow {...props} status={status} />)
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Prince Alex" } })
    const first = screen.getByLabelText("First name")
    view.rerender(<CustomerWelcomeFlow {...props} status={null} blocked />)
    expect(screen.getByLabelText("First name")).toBe(first)
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    const username = screen.getByLabelText("Username")
    fireEvent.change(username, { target: { value: "prince.home" } })
    for (let i = 0; i < 5; i++) {
      view.rerender(<CustomerWelcomeFlow {...props} status={{ ...status }} />)
      view.rerender(<CustomerWelcomeFlow {...props} status={null} blocked />)
      expect(screen.getByLabelText("Username")).toBe(username)
      expect(screen.getByText("STEP 2 OF 2")).toBeTruthy()
    }
    await waitFor(() => expect((screen.getByRole("button", { name: /Continue to CozyCraft/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: /Continue to CozyCraft/ }))
    await waitFor(() => expect(f.complete).toHaveBeenCalledWith("prince.home", { firstName: "Prince Alex", lastName: "Balane" }))
  })
  it("keeps a replay exclusive when a voucher is waiting and preferences refresh", async () => {
    const f = fixture()
    render(<CustomerWelcomeFlow userId={f.id} {...f} blocked={false} displayName="Alex Rivera" />)
    await screen.findByText("Welcome home.")
    fireEvent.click(screen.getByText("Skip tour"))
    await screen.findByText("WELCOME-FIXTURE")
    fireEvent(window, new Event("cozycraft-replay-tour"))
    await screen.findByText("Welcome home.")
    fireEvent(window, new Event("online"))
    await waitFor(() => expect(auth.getUser).toHaveBeenCalled())
    expect(screen.queryByText("WELCOME-FIXTURE")).toBeNull()
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    fireEvent.click(screen.getByText("Skip tour"))
    await screen.findByText("WELCOME-FIXTURE")
  })
  it("shows the tour before the issued voucher and hands off on Finish", async () => {
    const f = fixture()
    render(<CustomerWelcomeFlow userId={f.id} {...f} blocked={false} displayName="Alex Rivera" />)
    await screen.findByText("Welcome home.")
    expect(screen.queryByText("WELCOME-FIXTURE")).toBeNull()
    fireEvent.click(screen.getByText("Show me around"))
    for (let n = 0; n < 3; n++) {
      await waitFor(() => expect((screen.getByText("Next") as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByText("Next"))
    }
    await waitFor(() => expect((screen.getByText("Finish") as HTMLButtonElement).disabled).toBe(false))
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

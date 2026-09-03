import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CustomerSecurityGate from "./CustomerSecurityGate"

const mocks = vi.hoisted(() => ({
  session: vi.fn(), assurance: vi.fn(), factors: vi.fn(), verify: vi.fn(), registry: vi.fn(),
  guest: vi.fn(), logout: vi.fn(), unsubscribe: vi.fn(), authChange: null as null | ((event: string) => void),
}))
vi.mock("../../lib/supabase", () => ({
  isGuestMode: mocks.guest, enterGuestMode: mocks.logout,
  supabase: { auth: {
    getSession: mocks.session,
    onAuthStateChange: (callback: (event: string) => void) => { mocks.authChange = callback; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } } },
    mfa: { getAuthenticatorAssuranceLevel: mocks.assurance, listFactors: mocks.factors, challengeAndVerify: mocks.verify },
  } },
}))
vi.mock("./account-security", async (original) => ({ ...await original<object>(), syncMobileDeviceSession: mocks.registry }))
beforeEach(() => {
  mocks.guest.mockReturnValue(false)
  mocks.logout.mockResolvedValue(undefined)
  mocks.session.mockResolvedValue({ data: { session: { user: { id: "customer-a" } } }, error: null })
  mocks.assurance.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null })
  mocks.factors.mockResolvedValue({ data: { totp: [] }, error: null })
  mocks.registry.mockResolvedValue(true)
  mocks.verify.mockResolvedValue({ error: null })
  window.location.hash = "#/shop"
})
const mount = () => render(<CustomerSecurityGate><p>Protected customer profile</p></CustomerSecurityGate>)

describe("mobile compatibility with website two-step security", () => {
  it("keeps guest browsing working without an MFA or device registry request", async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null })
    mount()
    await screen.findByText("Protected customer profile")
    expect(mocks.assurance).not.toHaveBeenCalled()
    expect(mocks.registry).not.toHaveBeenCalled()
  })
  it("allows a signed-in customer without two-step verification", async () => {
    mount()
    await screen.findByText("Protected customer profile")
    expect(mocks.registry).toHaveBeenCalledTimes(1)
  })
  it("preserves offline browsing without calling network-only account services", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    mount()
    await screen.findByText("Protected customer profile")
    expect(mocks.factors).not.toHaveBeenCalled()
    expect(mocks.registry).not.toHaveBeenCalled()
  })
  it("does not bypass a required authenticator when the phone is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    mocks.assurance.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null })
    mount()
    expect((await screen.findByRole("alert")).textContent).toContain("Reconnect to complete two-step verification")
    expect(screen.queryByText("Protected customer profile")).toBeNull()
  })
  it("requires a verified authenticator before mounting protected customer data", async () => {
    mocks.factors.mockResolvedValue({ data: { totp: [{ id: "factor-a", status: "verified" }] }, error: null })
    mount()
    const input = await screen.findByLabelText("Authenticator code")
    expect(screen.queryByText("Protected customer profile")).toBeNull()
    expect(mocks.registry).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "012345" } })
    mocks.assurance.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null })
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }))
    await screen.findByText("Protected customer profile")
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: "factor-a", code: "012345" })
  })
  it("keeps an incorrect authenticator code from opening customer data", async () => {
    mocks.factors.mockResolvedValue({ data: { totp: [{ id: "factor-a", status: "verified" }] }, error: null })
    mocks.verify.mockResolvedValue({ error: { message: "Invalid code" } })
    mount()
    fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }))
    expect((await screen.findByRole("alert")).textContent).toContain("incorrect or expired")
    expect(screen.queryByText("Protected customer profile")).toBeNull()
  })
  it("does not reuse an allowed state after the server reports new MFA requirements", async () => {
    mount()
    await screen.findByText("Protected customer profile")
    mocks.factors.mockResolvedValue({ data: { totp: [{ id: "factor-a", status: "verified" }] }, error: null })
    await act(async () => { mocks.authChange?.("TOKEN_REFRESHED") })
    await screen.findByLabelText("Authenticator code")
    expect(screen.queryByText("Protected customer profile")).toBeNull()
  })
  it("shows a retryable check failure and removes its subscription on unmount", async () => {
    mocks.factors.mockResolvedValueOnce({ data: null, error: new Error("Could not check account security") })
    const view = mount()
    expect((await screen.findByRole("alert")).textContent).toBe("Could not check account security")
    expect(screen.queryByText("Protected customer profile")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry secure check" }))
    await screen.findByText("Protected customer profile")
    view.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1)
  })
  it("redirects a revoked mobile session without displaying private data", async () => {
    mocks.registry.mockResolvedValue(false)
    mount()
    await waitFor(() => expect(window.location.hash).toBe("#/sign-in?reason=session-ended"))
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Protected customer profile")).toBeNull()
  })
})

import { useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProfilePage } from "../../Storefront"
import type { MobileCustomerProfile } from "../../lib/mobile-data"

const mocks = vi.hoisted(() => ({
  request: vi.fn(), confirm: vi.fn(), save: vi.fn(), verified: vi.fn(),
  preferences: vi.fn(),
}))
vi.mock("../../lib/supabase", () => ({
  supabaseUrl: "https://test.invalid",
  supabase: {
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel },
    removeChannel: vi.fn(),
    auth: { getUser: async () => ({ data: { user: { app_metadata: { provider: "email" } } } }) },
  },
}))
vi.mock("../../lib/mobile-data", async (original) => ({
  ...await original<object>(),
  loadCommunicationPreferences: mocks.preferences,
}))
vi.mock("./phone-verification", async (original) => ({
  ...await original<object>(), requestPhoneVerification: mocks.request, confirmPhoneVerification: mocks.confirm,
}))

const initial: MobileCustomerProfile = {
  name: "alex", username: "alex", firstName: "Alex", lastName: "Rivera", email: "alex@example.test",
  phone: "+639171234567", phoneVerifiedAt: null, image: "", gender: "", birth: "1995-01-02",
}
const verifiedAt = "2026-08-28T10:00:00.000Z"
function Harness({ verified = false }: { verified?: boolean }) {
  const [profile, setProfile] = useState({ ...initial, phoneVerifiedAt: verified ? verifiedAt : null })
  return <ProfilePage {...profile} userId="customer-a" points={0} tier="Member" completedOrders={0} savedCount={0}
    close={() => {}} openWishlist={() => {}}
    onPhoneVerified={(value) => { mocks.verified(value); setProfile((current) => ({ ...current, ...value })) }}
    save={async (value) => { await mocks.save(value); setProfile(value as typeof profile) }} />
}
beforeEach(() => {
  mocks.preferences.mockResolvedValue({ delivery_updates: true, home_circle_notes: false })
  mocks.save.mockResolvedValue(undefined)
  mocks.request.mockResolvedValue({ kind: "challenge", challenge: {
    id: "0f329e1a-e7fa-4fb1-aa4d-4f3f8d187309", phone: initial.phone, maskedPhone: "+6391•••4567",
    expiresAt: Date.now() + 300_000, resendAvailableAt: Date.now() + 60_000,
  } })
  mocks.confirm.mockResolvedValue({ phone: initial.phone, phoneVerifiedAt: verifiedAt })
})
const editName = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }))
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Alexandra" } })
}

describe("profile saving with verified phones", () => {
  it("verifies before profile save and keeps all other unsaved edits", async () => {
    render(<Harness />)
    await editName()
    fireEvent.click(screen.getByRole("button", { name: /Save profile changes/ }))
    const otp = await screen.findByLabelText("Verification code")
    expect(mocks.save).not.toHaveBeenCalled()
    fireEvent.change(otp, { target: { value: "012345" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and save number" }))
    await screen.findByText("Number verified.")
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByText("Verify your mobile number before saving your profile changes.")).toBeNull()
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Alexandra")
    expect(mocks.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Save profile changes/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ firstName: "Alexandra", phone: initial.phone, phoneVerifiedAt: verifiedAt })
    await screen.findByRole("button", { name: "Edit profile" })
  })

  it("does not send another SMS for a previously verified, unchanged number", async () => {
    render(<Harness verified />)
    await editName()
    fireEvent.click(screen.getByRole("button", { name: /Save profile changes/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it("keeps a verified number when an unverified replacement is cancelled", async () => {
    render(<Harness verified />)
    await editName()
    fireEvent.click(screen.getByRole("button", { name: "Change number" }))
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "09181234567" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value).toBe(initial.phone)
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe(initial.firstName)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.verified).not.toHaveBeenCalled()
  })

  it("keeps edits open and shows a database rejection without pretending to save", async () => {
    mocks.save.mockRejectedValue({ message: "Your session has expired. Sign in again.", code: "PGRST301" })
    render(<Harness verified />)
    await editName()
    fireEvent.click(screen.getByRole("button", { name: /Save profile changes/ }))
    await screen.findByText("Your session has expired. Sign in again.")
    expect((screen.getByLabelText("First name") as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Alexandra")
  })

  it("rejects an invalid replacement without issuing an OTP request", async () => {
    render(<Harness verified />)
    await editName()
    fireEvent.click(screen.getByRole("button", { name: "Change number" }))
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "12345" } })
    fireEvent.click(screen.getByRole("button", { name: /Save profile changes/ }))
    await screen.findByText("Enter a valid Philippine mobile number, such as 0917 123 4567.")
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    await act(async () => {})
  })
})

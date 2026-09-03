import { useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import PhoneVerificationField from "./PhoneVerificationField"
import { usePhoneVerification } from "./usePhoneVerification"
import { PhoneVerificationError, type PhoneChallenge, type VerifiedPhone } from "./phone-verification"

const api = vi.hoisted(() => ({ request: vi.fn(), confirm: vi.fn() }))
vi.mock("./phone-verification", async (original) => ({
  ...await original<typeof import("./phone-verification")>(),
  requestPhoneVerification: api.request,
  confirmPhoneVerification: api.confirm,
}))

const phone = "+639171234567"
const verifiedAt = "2026-08-27T12:00:00.000Z"
const challenge = (): PhoneChallenge => ({ id: "22a0851f-a10f-4e42-b16d-963f558701aa", phone, maskedPhone: "+6391•••4567", expiresAt: Date.now() + 300_000, resendAvailableAt: Date.now() + 60_000 })
const verifiedCallback = vi.fn()

function Harness({ initialVerified = false, userId = "customer-a" }: { initialVerified?: boolean; userId?: string }) {
  const [draft, setDraft] = useState(phone)
  const [saved, setSaved] = useState<VerifiedPhone>({ phone, phoneVerifiedAt: initialVerified ? verifiedAt : "" })
  const controller = usePhoneVerification({ userId, draftPhone: draft, savedPhone: saved.phone, phoneVerifiedAt: saved.phoneVerifiedAt,
    onDraftChange: setDraft, onVerified: (value) => { setSaved(value); verifiedCallback(value) },
  })
  return <>
    <PhoneVerificationField phone={draft} savedPhone={saved.phone} verifiedAt={saved.phoneVerifiedAt || null}
      editing disabled={false} onChange={setDraft} verification={controller} />
    <output aria-label="Saved mobile number">{saved.phone}</output>
    <button onClick={() => setSaved({ phone: draft, phoneVerifiedAt: verifiedAt })}>Simulate database update</button>
  </>
}

beforeEach(() => {
  vi.clearAllMocks()
  api.request.mockImplementation(async () => ({ kind: "challenge", challenge: challenge() }))
  api.confirm.mockResolvedValue({ phone, phoneVerifiedAt: verifiedAt })
})
afterEach(() => vi.useRealTimers())

describe("mobile phone verification", () => {
  it("saves only after successful verification and shows a success dialog", async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    const input = await screen.findByLabelText("Verification code")
    expect(verifiedCallback).not.toHaveBeenCalled()
    expect((screen.getByRole("button", { name: "Resend in 60s" }) as HTMLButtonElement).disabled).toBe(true)
    expect(input.getAttribute("autocomplete")).toBe("one-time-code")
    fireEvent.change(input, { target: { value: "012345" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and save number" }))
    expect(await screen.findByRole("heading", { name: "Number verified." })).toBeTruthy()
    expect(verifiedCallback).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByText("✓ Verified")).toBeTruthy()
  })
  it("ignores double taps while an SMS request is in flight", async () => {
    let resolve!: (value: unknown) => void
    api.request.mockReturnValue(new Promise((done) => { resolve = done }))
    render(<Harness />)
    const button = screen.getByRole("button", { name: "Verify number" })
    fireEvent.click(button); fireEvent.click(button)
    expect(api.request).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Sending your verification code…")).toBeTruthy()
    await act(async () => resolve({ kind: "challenge", challenge: challenge() }))
  })
  it("keeps the current verified number while changing or cancelling a replacement", () => {
    render(<Harness initialVerified />)
    const phoneInput = screen.getByLabelText("Mobile number") as HTMLInputElement
    expect(phoneInput.disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Change number" }))
    fireEvent.change(phoneInput, { target: { value: "09181234567" } })
    expect(screen.getByLabelText("Saved mobile number").textContent).toBe(phone)
    expect(screen.queryByText("✓ Verified")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Keep current number" }))
    expect(phoneInput.value).toBe(phone)
    expect(api.request).not.toHaveBeenCalled()
  })
  it("uses the server error and cooldown instead of returning a generic connection message", async () => {
    api.request.mockRejectedValue(new PhoneVerificationError("Wait before requesting another code.", 429, 43))
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Wait before requesting another code.")
    expect((screen.getByRole("button", { name: "Try again in 43s" }) as HTMLButtonElement).disabled).toBe(true)
    expect(verifiedCallback).not.toHaveBeenCalled()
  })
  it("does not disable a valid code after a failed resend", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(61_000) })
    api.request.mockRejectedValueOnce(new PhoneVerificationError("SMS provider is temporarily unavailable.", 503))
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }))
    await act(async () => {})
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "012345" } })
    expect((screen.getByRole("button", { name: "Verify and save number" }) as HTMLButtonElement).disabled).toBe(false)
  })
  it("expires accurately after the phone has been in the background", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    await act(async () => {})
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "012345" } })
    await act(async () => { vi.setSystemTime(Date.now() + 301_000); window.dispatchEvent(new Event("focus")) })
    expect(screen.getByText("Code expired")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Verify and save number" }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.confirm).not.toHaveBeenCalled()
  })
  it("shows incorrect-code feedback and permits retry until the server locks the challenge", async () => {
    api.confirm.mockRejectedValueOnce(new PhoneVerificationError("That code is incorrect. 4 attempts remaining.", 400, 0, 4))
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "111111" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and save number" }))
    expect((await screen.findByRole("alert")).textContent).toContain("4 attempts remaining")
    api.confirm.mockRejectedValueOnce(new PhoneVerificationError("Too many incorrect attempts. Request a new code.", 400, 0, 0))
    fireEvent.click(screen.getByRole("button", { name: "Verify and save number" }))
    await waitFor(() => expect((screen.getByRole("button", { name: "Verify and save number" }) as HTMLButtonElement).disabled).toBe(true))
    expect(verifiedCallback).not.toHaveBeenCalled()
  })
  it("reopens an existing challenge without sending another SMS", async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    await screen.findByLabelText("Verification code")
    fireEvent.click(screen.getByRole("button", { name: "Close phone verification" }))
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    expect(api.request).toHaveBeenCalledOnce()
    expect(screen.getByLabelText("Verification code")).toBeTruthy()
  })
  it("clears an old challenge when a different number is entered", async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    await screen.findByLabelText("Verification code")
    fireEvent.click(screen.getByRole("button", { name: "Close phone verification" }))
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "09181234567" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    expect(screen.queryByLabelText("Verification code")).toBeNull()
    expect(verifiedCallback).not.toHaveBeenCalled()
  })
  it("aborts a request on account change and ignores the previous account’s response", async () => {
    let resolve!: (value: unknown) => void
    api.request.mockReturnValue(new Promise((done) => { resolve = done }))
    const view = render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }))
    const signal = api.request.mock.calls[0][1] as AbortSignal
    view.rerender(<Harness userId="customer-b" />)
    expect(signal.aborted).toBe(true)
    await act(async () => resolve({ kind: "verified", verified: { phone, phoneVerifiedAt: verifiedAt } }))
    expect(verifiedCallback).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("updates the visible verified state from a database profile update", async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Simulate database update" }))
    expect(screen.getByText("✓ Verified")).toBeTruthy()
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).disabled).toBe(true)
  })
})

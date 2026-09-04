import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PaymentEmailVerificationDialog from "./PaymentEmailVerificationDialog"
import type { PaymentEmailChallenge } from "./payment-email-verification"

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), request: vi.fn() }))
vi.mock("./payment-email-verification", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./payment-email-verification")>()
  return {
    ...actual,
    confirmPaymentEmailVerification: mocks.confirm,
    requestPaymentEmailVerification: mocks.request,
  }
})

const challenge: PaymentEmailChallenge = {
  id: "22a0851f-a10f-4e42-b16d-963f558701aa",
  maskedEmail: "al••••@e••••••.com",
  expiresAt: Date.now() + 300_000,
  resendAvailableAt: Date.now() - 1,
  intent: {
    addressId: "99bdb728-40a8-4575-ac91-31228449c349",
    checkoutKey: "30cfb521-9c92-4b8a-8dc7-b1cf8b663648",
    paymentMethod: "gcash",
    items: [{ product_id: "EKOLSUND", quantity: 1 }],
    redemptionId: null,
  },
}

beforeEach(() => vi.resetAllMocks())

describe("payment email verification dialog", () => {
  it("shows only the masked email and exact payment summary", () => {
    render(<PaymentEmailVerificationDialog challenge={challenge} total={12_999} onCancel={() => {}} onChallengeChange={() => {}} onAuthorized={async () => {}} />)
    expect(screen.getByText("al••••@e••••••.com")).toBeTruthy()
    expect(screen.getByText("GCash")).toBeTruthy()
    expect(screen.getByText("₱12,999")).toBeTruthy()
    expect(screen.queryByText("alex@example.com")).toBeNull()
  })

  it("verifies a complete code and opens checkout with the server authorization", async () => {
    const onAuthorized = vi.fn().mockResolvedValue(undefined)
    mocks.confirm.mockResolvedValue({
      id: challenge.id,
      checkoutKey: challenge.intent.checkoutKey,
      paymentMethod: "gcash",
      expiresAt: Date.now() + 240_000,
    })
    render(<PaymentEmailVerificationDialog challenge={challenge} total={12_999} onCancel={() => {}} onChallengeChange={() => {}} onAuthorized={onAuthorized} />)
    fireEvent.change(screen.getByLabelText("PAYMENT CODE"), { target: { value: "012 345" } })
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(challenge, "012345"))
    await waitFor(() => expect(onAuthorized).toHaveBeenCalledWith(expect.objectContaining({ id: challenge.id })))
  })

  it("keeps the dialog recoverable when PayMongo cannot open", async () => {
    mocks.confirm.mockResolvedValue({ id: challenge.id, checkoutKey: challenge.intent.checkoutKey, paymentMethod: "gcash", expiresAt: Date.now() + 240_000 })
    const onAuthorized = vi.fn().mockRejectedValue(new Error("PayMongo is taking too long to respond."))
    render(<PaymentEmailVerificationDialog challenge={challenge} total={12_999} onCancel={() => {}} onChallengeChange={() => {}} onAuthorized={onAuthorized} />)
    fireEvent.change(screen.getByLabelText("PAYMENT CODE"), { target: { value: "012345" } })
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }))
    expect(await screen.findByText("PayMongo is taking too long to respond.")).toBeTruthy()
    expect(screen.getByRole("button", { name: /try secure checkout again/i })).toBeTruthy()
  })

  it("resends only from an explicit tap and replaces the challenge", async () => {
    const replacement = { ...challenge, id: "576cab56-8818-49e6-9ee8-6891e6e93166", resendAvailableAt: Date.now() + 60_000 }
    const onChallengeChange = vi.fn()
    mocks.request.mockResolvedValue(replacement)
    render(<PaymentEmailVerificationDialog challenge={challenge} total={12_999} onCancel={() => {}} onChallengeChange={onChallengeChange} onAuthorized={async () => {}} />)
    expect(mocks.request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /send a new code/i }))
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(challenge.intent))
    expect(onChallengeChange).toHaveBeenCalledWith(replacement)
  })
})

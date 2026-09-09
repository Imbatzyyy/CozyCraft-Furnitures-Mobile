import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearGoogleOnboardingDraft } from "./google-onboarding-draft"
import GoogleCustomerOnboarding, { customerInitials } from "./GoogleCustomerOnboarding"
import type { MobileGoogleOnboardingStatus } from "./google-customer-onboarding"

const usernameStatus: MobileGoogleOnboardingStatus = {
  userId: "customer-id",
  isGoogle: true,
  needsUsername: true,
  username: "",
  showVoucher: false,
  voucher: null,
}

const voucherStatus: MobileGoogleOnboardingStatus = {
  ...usernameStatus,
  needsUsername: false,
  username: "cozyhome",
  showVoucher: true,
  voucher: {
    id: "voucher-id",
    code: "WELCOME-A1B2C3D4",
    discountAmount: 500,
    minimumOrderAmount: 5000,
    expiresAt: "2026-10-04T00:00:00.000Z",
  },
}

describe("first-time Google customer onboarding", () => {
  beforeEach(() => clearGoogleOnboardingDraft())
  it("keeps a slow save locked if the surrounding route remounts", async () => {
    let resolve!: () => void
    const complete = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    const props = { status: usernameStatus, displayName: "Prince Balane", complete, dismissVoucher: vi.fn(), startShopping: vi.fn() }
    const first = render(<GoogleCustomerOnboarding {...props} />)
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "prince.home" } })
    await waitFor(() => expect((screen.getByRole("button", { name: /Continue to CozyCraft/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: /Continue to CozyCraft/ }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    first.unmount()
    render(<GoogleCustomerOnboarding {...props} />)
    const saving = screen.getByRole("button", { name: /Saving your account/ }) as HTMLButtonElement
    expect(saving.disabled).toBe(true)
    for (let n = 0; n < 10; n++) fireEvent.click(saving)
    expect(complete).toHaveBeenCalledTimes(1)
    resolve()
    await waitFor(() => expect(screen.queryByText("Saving your account…")).toBeNull())
  })
  it("preserves edited names and Step 2 across an ancestor remount", async () => {
    const complete = vi.fn().mockResolvedValue(undefined)
    const props = { status: usernameStatus, displayName: "Prince Balane", complete, dismissVoucher: vi.fn(), startShopping: vi.fn() }
    let view = render(<GoogleCustomerOnboarding {...props} />)
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Prince Alex" } })
    view.unmount()
    view = render(<GoogleCustomerOnboarding {...props} />)
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Prince Alex")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "prince.home" } })
    view.unmount()
    view = render(<GoogleCustomerOnboarding {...props} />)
    expect(screen.getByText("STEP 2 OF 2")).toBeTruthy()
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("prince.home")
    fireEvent.click(screen.getByRole("button", { name: /Continue to CozyCraft/ }))
    await waitFor(() => expect(complete).toHaveBeenCalledWith("prince.home", { firstName: "Prince Alex", lastName: "Balane" }))
    view.unmount()
    render(<GoogleCustomerOnboarding {...props} status={{ ...usernameStatus, userId: "another-customer" }} displayName="Another Customer" />)
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Another")
    expect(screen.getByText("STEP 1 OF 2")).toBeTruthy()
  })
  it("recovers voucher actions after failure and reopening", async () => {
    const dismissVoucher = vi.fn().mockRejectedValueOnce(new Error("Please retry")) .mockResolvedValue(undefined)
    const props = { displayName: "Joy Rivera", complete: vi.fn(), dismissVoucher, startShopping: vi.fn() }
    const view = render(<GoogleCustomerOnboarding {...props} status={voucherStatus} />)
    fireEvent.click(screen.getByText("Keep it for later"))
    await screen.findByText("Please retry")
    fireEvent.click(screen.getByText("Keep it for later"))
    await waitFor(() => expect(dismissVoucher).toHaveBeenCalledTimes(2))
    view.rerender(<GoogleCustomerOnboarding {...props} status={{ ...voucherStatus, showVoucher: false }} />)
    view.rerender(<GoogleCustomerOnboarding {...props} status={voucherStatus} />)
    expect((screen.getByText("Keep it for later") as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText("Please retry")).toBeNull()
  })
  it("preserves the draft and submission lock during status refreshes", async () => {
    let finish!: () => void
    const complete = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const props = { displayName: "Joy Rivera", complete, dismissVoucher: vi.fn(), startShopping: vi.fn() }
    const view = render(<GoogleCustomerOnboarding {...props} status={usernameStatus} />)
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Joy Anne" } })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "joy.home" } })
    view.rerender(<GoogleCustomerOnboarding {...props} status={{ ...usernameStatus, username: "stale" }} />)
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("joy.home")
    await waitFor(() => expect((screen.getByRole("button", { name: /Continue to CozyCraft/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: /Continue to CozyCraft/ }))
    view.rerender(<GoogleCustomerOnboarding {...props} status={{ ...usernameStatus }} />)
    expect((screen.getByRole("button", { name: /Saving your account/ }) as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(complete).toHaveBeenCalledWith("joy.home", { firstName: "Joy Anne", lastName: "Rivera" })
    finish()
    await waitFor(() => expect(screen.queryByText("Saving your account…")).toBeNull())
  })
  it("uses initials when no customer-selected photo exists", () => {
    expect(customerInitials("Joy Rivera")).toBe("JR")
    expect(customerInitials("joy")).toBe("J")
    expect(customerInitials(" ")).toBe("C")
  })

  it("requires a valid unique-style username before continuing", async () => {
    const complete = vi.fn().mockResolvedValue(undefined)
    render(<GoogleCustomerOnboarding status={usernameStatus} displayName="Joy Rivera"
      complete={complete} dismissVoucher={vi.fn()} startShopping={vi.fn()} />)

    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Joy")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    const input = screen.getByLabelText("Username")
    fireEvent.change(input, { target: { value: "j!" } })
    expect((input as HTMLInputElement).value).toBe("j")
    expect((screen.getByRole("button", { name: /Continue to CozyCraft/ }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(input, { target: { value: "joy.home" } })
    await waitFor(() => expect((screen.getByRole("button", { name: /Continue to CozyCraft/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: /Continue to CozyCraft/ }))
    await waitFor(() => expect(complete).toHaveBeenCalledWith("joy.home", { firstName: "Joy", lastName: "Rivera" }))
  })

  it("shows the issued voucher and lets the customer start shopping", async () => {
    const startShopping = vi.fn().mockResolvedValue(undefined)
    render(<GoogleCustomerOnboarding status={voucherStatus} displayName="Joy Rivera"
      complete={vi.fn()} dismissVoucher={vi.fn()} startShopping={startShopping} />)

    expect(screen.getByText("₱5,000")).toBeTruthy()
    expect(screen.getByText("WELCOME-A1B2C3D4")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Start shopping/ }))
    await waitFor(() => expect(startShopping).toHaveBeenCalledTimes(1))
  })

  it("can keep the database voucher for later without navigating", async () => {
    const dismissVoucher = vi.fn().mockResolvedValue(undefined)
    render(<GoogleCustomerOnboarding status={voucherStatus} displayName="Joy Rivera"
      complete={vi.fn()} dismissVoucher={dismissVoucher} startShopping={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /Keep it for later/ }))
    await waitFor(() => expect(dismissVoucher).toHaveBeenCalledTimes(1))
  })

  it("releases the app interaction lock when the voucher closes without unmounting", async () => {
    const appRoot = document.createElement("main")
    const homeButton = document.createElement("button")
    const touched = vi.fn()
    appRoot.id = "root"
    homeButton.textContent = "Home"
    homeButton.addEventListener("click", touched)
    appRoot.appendChild(homeButton)
    document.body.appendChild(appRoot)

    const view = render(<GoogleCustomerOnboarding status={voucherStatus} displayName="Joy Rivera"
      complete={vi.fn()} dismissVoucher={vi.fn()} startShopping={vi.fn()} />)

    expect(appRoot.inert).toBe(true)
    expect(document.body.classList.contains("google-onboarding-open")).toBe(true)

    view.rerender(<GoogleCustomerOnboarding
      status={{ ...voucherStatus, showVoucher: false, voucher: null }}
      displayName="Joy Rivera"
      complete={vi.fn()}
      dismissVoucher={vi.fn()}
      startShopping={vi.fn()}
    />)

    await waitFor(() => expect(appRoot.inert).toBe(false))
    expect(document.body.classList.contains("google-onboarding-open")).toBe(false)
    fireEvent.click(homeButton)
    expect(touched).toHaveBeenCalledTimes(1)

    view.unmount()
    appRoot.remove()
  })
})

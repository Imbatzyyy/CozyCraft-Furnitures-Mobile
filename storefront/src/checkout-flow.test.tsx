import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loadAddresses: vi.fn(),
  loadPaymentPreference: vi.fn(),
  saveAddress: vi.fn(),
  requestPaymentEmailVerification: vi.fn(),
}))

vi.mock("./lib/mobile-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/mobile-data")>()
  return {
    ...actual,
    loadAddresses: mocks.loadAddresses,
    loadPaymentPreference: mocks.loadPaymentPreference,
    saveAddress: mocks.saveAddress,
  }
})

vi.mock("./features/checkout/payment-email-verification", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./features/checkout/payment-email-verification")>()
  return {
    ...actual,
    requestPaymentEmailVerification: mocks.requestPaymentEmailVerification,
  }
})

import { CheckoutPage } from "./Storefront"

const addressId = "99bdb728-40a8-4575-ac91-31228449c349"

const renderCheckout = () => render(
  <CheckoutPage
    userId="8150a7d9-8f0c-49fd-8816-35b18a399a6a"
    lines={[{
      product: {
        id: "EKOLSUND",
        name: "EKOLSUND",
        category: "Living room",
        price: "₱12,999",
        image: "/chair.jpg",
        alt: "Purple armchair",
      },
      quantity: 2,
      selected: true,
    }]}
    profile={{ name: "Alex", email: "alex@example.com", phone: "+639171234567", image: "" }}
    storeSettings={{
      announcement_enabled: false,
      announcement_text: "",
      announcement_link: "",
      delivery_area: "Metro Manila",
      checkout_settings: { cod_enabled: true, card_enabled: true, gcash_enabled: true },
      fulfillment_settings: {},
    }}
    deliveryAreas={[{
      id: 1,
      area_code: "metro-manila",
      name: "Metro Manila",
      description: "NCR deliveries",
      delivery_fee: 650,
      free_delivery_minimum: 50_000,
      lead_time_min_days: 2,
      lead_time_max_days: 4,
      assembly_available: true,
      active: true,
      sort_order: 10,
    }]}
    redemptions={[{
      id: "576cab56-8818-49e6-9ee8-6891e6e93166",
      points_cost: 0,
      discount_amount: 500,
      reward_source: "welcome",
      minimum_order_amount: 5_000,
      status: "available",
      code: "WELCOME-COZY2026",
      created_at: "2026-09-04T00:00:00.000Z",
      expires_at: "2026-10-04T00:00:00.000Z",
      used_at: null,
    }]}
    close={() => {}}
    complete={() => {}}
  />,
)

beforeEach(() => {
  mocks.loadAddresses.mockResolvedValue([{
    id: addressId,
    label: "Home",
    recipient_name: "Alex",
    mobile: "+639171234567",
    email: "alex@example.com",
    address_line: "1 Sample Street",
    barangay: "Bagong Pag-asa",
    city: "Quezon City",
    province: "Metro Manila",
    postal_code: "1105",
    delivery_note: "",
    is_primary: true,
  }])
  mocks.loadPaymentPreference.mockResolvedValue("gcash")
  mocks.requestPaymentEmailVerification.mockReset()
  mocks.saveAddress.mockReset()
})

describe("checkout payment handoff", () => {
  it("guards same-frame duplicate address submits and uses the returned row", async () => {
    let resolve!: (address: Record<string, unknown>) => void
    mocks.saveAddress.mockReturnValueOnce(new Promise(done => { resolve = done }))
    renderCheckout()
    await screen.findByText("Saved addresses")
    fireEvent.click(screen.getByRole("button", { name: "Edit Home address" }))
    const save = screen.getByRole("button", { name: "Save and use this address" })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(mocks.saveAddress).toHaveBeenCalledTimes(1)
    const data = mocks.saveAddress.mock.calls[0][1]
    resolve({ ...data, id: addressId, label: "Verified Home" })
    await screen.findByText("Verified Home")
    expect(screen.queryByRole("button", { name: "Save and use this address" })).toBeNull()
    expect(mocks.loadAddresses).toHaveBeenCalledTimes(1)
  })

  it("keeps addresses usable when the optional payment preference fails", async () => {
    mocks.loadPaymentPreference.mockRejectedValueOnce(new Error("temporarily offline"))
    renderCheckout()
    expect(await screen.findByText("Saved addresses")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    expect(screen.getByText("PAYMENT METHOD")).toBeTruthy()
  })

  it("shows a retry instead of a blank delivery step when loading fails", async () => {
    mocks.loadAddresses.mockRejectedValueOnce(new Error("offline"))
    renderCheckout()
    fireEvent.click(await screen.findByRole("button", { name: "Retry delivery addresses" }))
    expect(await screen.findByText("Saved addresses")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Retry delivery addresses" })).toBeNull()
  })

  it("does not overwrite a chosen payment method with a delayed preference", async () => {
    let resolve!: (method: string) => void
    mocks.loadPaymentPreference.mockReturnValueOnce(new Promise<string>(done => { resolve = done }))
    renderCheckout()
    await screen.findByText("Saved addresses")
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    fireEvent.click(screen.getByRole("button", { name: /Credit or debit card/ }))
    resolve("gcash")
    await waitFor(() => expect(screen.getByRole("button", { name: /Credit or debit card/ }).classList.contains("selected")).toBe(true))
    expect(screen.getByRole("button", { name: /GCash/ }).classList.contains("selected")).toBe(false)
  })

  it("keeps the complete amount breakdown and exposes an OTP request failure on Review", async () => {
    mocks.requestPaymentEmailVerification.mockRejectedValue(
      new Error("The payment code email could not be sent. Please try again."),
    )
    renderCheckout()

    await screen.findByText("Saved addresses")
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))
    expect(screen.getByText("PAYMENT METHOD")).toBeTruthy()
    const welcomeReward = screen.getByRole("button", { name: /welcome reward/i })
    expect(welcomeReward.classList.contains("welcome-reward")).toBe(true)
    expect(welcomeReward.classList.contains("welcome")).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: /continue/i }))

    expect(screen.getByText("REVIEW YOUR ORDER")).toBeTruthy()
    expect(screen.getByText("Recipient")).toBeTruthy()
    expect(screen.getByText("Alex · +639171234567")).toBeTruthy()
    expect(screen.getByText("Email receipt")).toBeTruthy()
    expect(screen.getByText("alex@example.com")).toBeTruthy()
    expect(screen.getByText("Furniture subtotal")).toBeTruthy()
    expect(screen.getByText("Delivery fee")).toBeTruthy()
    expect(screen.getAllByText("₱25,998")).toHaveLength(2)
    expect(screen.getByText("₱650")).toBeTruthy()
    expect(screen.getByText(/Next: verify this payment by email/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /send payment code/i }))

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The payment code email could not be sent. Please try again.",
    )
    await waitFor(() => expect(
      (screen.getByRole("button", { name: /send payment code/i }) as HTMLButtonElement).disabled,
    ).toBe(false))
  })
})

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ resume: vi.fn(), session: vi.fn() }))
vi.mock("./lib/resume-payment", () => ({ resumeOrderPayment: mocks.resume }))
vi.mock("./lib/supabase", () => ({ supabase: {
  auth: { getSession: mocks.session },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel }, removeChannel: vi.fn(),
} }))
vi.mock("./lib/mobile-data", async original => ({
  ...await original<typeof import("./lib/mobile-data")>(), loadAddresses: async () => [], loadMobileReturnRequests: async () => [], loadSupportTickets: async () => [], loadPaymentPreference: async () => "cod",
}))
import { Account } from "./Storefront"
import { localStore } from "./lib/browser-storage"
const order = { id: "CC-01999", databaseId: "order-a", createdAt: "2026-09-30T01:00:00Z", total: 26000, status: "Processing" as const, payment: "gcash", paymentStatus: "pending", paymentExpiresAt: "2099-09-30T03:15:00Z", address: "Quezon City", items: [] }
const props = { userId: "customer-a", flash: vi.fn(), name: "Alex", email: "", image: "", orders: [order], points: 0, tier: "member", lifetimeSpend: 0, completedOrders: 0, savedCount: 0, bagCount: 0, unreadNotificationCount: 0, textSize: "comfortable" as const, changeTextSize: () => {}, pushPermission: "granted" as const, enableNotifications: () => {}, edit: () => {}, shop: () => {}, openMembership: () => {}, reviewPublished: () => {}, initialView: "orders" as const, onInitialViewHandled: () => {} }
beforeEach(() => { mocks.resume.mockReset(); mocks.session.mockResolvedValue({ data: { session: { user: { id: "customer-a" } } } }) })
it("blocks rapid taps and resumes the exact order without opening order details", async () => {
  let finish!: (value: unknown) => void
  mocks.resume.mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(<Account {...props} />)
  const button = await screen.findByRole("button", { name: /Continue payment/ })
  fireEvent.click(button); fireEvent.click(button); fireEvent.click(button)
  expect(mocks.resume).toHaveBeenCalledExactlyOnceWith("order-a")
  expect(screen.queryByRole("dialog", { name: "Order CC-01999 details" })).toBeNull()
  await act(async () => finish({ paid: true, orderId: "order-a" }))
  expect(props.flash).toHaveBeenCalledWith("Payment is already confirmed. Your order is being updated.")
})
it("renders exactly one payment panel in detail and tracks realtime settlement", async () => {
  const view = render(<Account {...props} />)
  fireEvent.click(await screen.findByRole("button", { name: /View complete order/ }))
  expect(screen.getAllByLabelText("Order payment window")).toHaveLength(1)
  expect(document.querySelector(".order-detail-status")?.textContent).toBe("Awaiting payment")
  expect(document.querySelector(".order-journey")).toBeNull()
  view.rerender(<Account {...props} orders={[{ ...order, paymentStatus: "paid" }]} />)
  await waitFor(() => expect(screen.queryByLabelText("Order payment window")).toBeNull())
  expect(document.querySelector(".order-detail-status")?.textContent).toBe("Processing")
  expect(document.querySelector(".order-journey")).not.toBeNull()
})
it("keeps a retryable error attached to the right order", async () => {
  mocks.resume.mockRejectedValue(new Error("The payment window has expired."))
  render(<Account {...props} />)
  fireEvent.click(await screen.findByRole("button", { name: /Continue payment/ }))
  expect((await screen.findByRole("alert")).textContent).toContain("payment window has expired")
  expect(screen.getByRole("button", { name: /Continue payment/ }).hasAttribute("disabled")).toBe(false)
})
it("discards a late response after the account view is unmounted", async () => {
  let finish!: (value: unknown) => void
  mocks.resume.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<Account {...props} />)
  fireEvent.click(await screen.findByRole("button", { name: /Continue payment/ }))
  view.unmount()
  await act(async () => finish({ paid: true, orderId: "order-a" }))
  expect(mocks.session).not.toHaveBeenCalled()
  expect(props.flash).not.toHaveBeenCalled()
})
it("does not hand a checkout to a different signed-in account", async () => {
  mocks.session.mockResolvedValue({ data: { session: { user: { id: "customer-b" } } } })
  mocks.resume.mockResolvedValue({ paid: true, orderId: "order-a" })
  render(<Account {...props} />)
  fireEvent.click(await screen.findByRole("button", { name: /Continue payment/ }))
  await waitFor(() => expect(mocks.session).toHaveBeenCalled())
  expect(props.flash).not.toHaveBeenCalled()
})

it("saves the original order/deadline and opens the authenticated session through the native bridge", async () => {
  const originalParent = window.parent
  const postMessage = vi.fn()
  Object.defineProperty(window, "parent", { configurable: true, value: { postMessage } })
  mocks.resume.mockResolvedValue({ paid: false, orderId: "order-a", checkoutUrl: "https://checkout.paymongo.com/existing", expiresAt: order.paymentExpiresAt })
  try {
    render(<Account {...props} />)
    fireEvent.click(await screen.findByRole("button", { name: /Continue payment/ }))
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: "cozycraft-open-paymongo", url: "https://checkout.paymongo.com/existing", orderId: order.databaseId }, "*"))
    expect(JSON.parse(localStore.getItem("cozycraft-pending-payment")!)).toMatchObject({ orderId: "order-a", orderNumber: "CC-01999", expiresAt: order.paymentExpiresAt, startedAt: order.createdAt, total: 26000 })
  } finally { Object.defineProperty(window, "parent", { configurable: true, value: originalParent }) }
})

import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { Account, OrderComplete } from "./Storefront"

vi.mock("./lib/supabase", () => ({ supabase: { channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel }, removeChannel: vi.fn() } }))

vi.mock("./lib/mobile-data", async importOriginal => ({
  ...await importOriginal<typeof import("./lib/mobile-data")>(),
  loadAddresses: async () => [],
  loadMobileReturnRequests: async () => [],
  loadSupportTickets: async () => [],
  loadPaymentPreference: async () => "cod",
}))

it("offers a distinct exact-order action without replacing home or browsing", () => {
  const viewOrder = vi.fn()
  const home = vi.fn()
  const close = vi.fn()
  render(<OrderComplete order={{ id: "CC-01131", databaseId: "order-1131", createdAt: "2026-09-07", total: 1000, status: "Processing", payment: "Cash on delivery", address: "Manila", items: [] }} viewOrder={viewOrder} goHome={home} close={close} pushPermission="granted" enableNotifications={() => {}} />)
  expect(screen.getByText("#CC-01131")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "View order details" }))
  expect(viewOrder).toHaveBeenCalledOnce()
  expect(home).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Back to home" }))
  expect(home).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "Continue browsing" }))
  expect(close).toHaveBeenCalledOnce()
})

it("opens the requested order details even before the orders list refresh completes", async () => {
  const handled = vi.fn()
  render(<Account userId="fixture" flash={() => {}} name="Alex" email="" image="" orders={[]} points={0} tier="member" lifetimeSpend={0} completedOrders={0} savedCount={0} bagCount={0} unreadNotificationCount={0} textSize="comfortable" changeTextSize={() => {}} pushPermission="granted" enableNotifications={() => {}} edit={() => {}} shop={() => {}} openMembership={() => {}} reviewPublished={() => {}} initialView="orders" onInitialViewHandled={() => {}} initialOrder={{ id: "CC-01131", databaseId: "order-1131", createdAt: "2026-09-07", total: 1000, status: "Processing", payment: "Cash on delivery", address: "Manila", items: [] }} onInitialOrderHandled={handled} />)
  expect(await screen.findByRole("dialog", { name: "Order CC-01131 details" })).toBeTruthy()
  expect(handled).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "Return to all orders" }))
  expect(screen.queryByRole("dialog", { name: "Order CC-01131 details" })).toBeNull()
})

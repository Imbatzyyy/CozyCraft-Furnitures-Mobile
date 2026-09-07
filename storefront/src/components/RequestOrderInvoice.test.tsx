import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import RequestOrderInvoice from "./RequestOrderInvoice"
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }))
beforeEach(() => mocks.invoke.mockReset())
it("shows confirmation only after email service acceptance, for the exact order", async () => {
  let finish: (value: unknown) => void = () => {}
  mocks.invoke.mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(<RequestOrderInvoice orderId="specific-order" />)
  fireEvent.click(screen.getByRole("button", { name: "Request an invoice" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect((screen.getByRole("button", { name: "Sending invoice…" }) as HTMLButtonElement).disabled).toBe(true)
  expect(mocks.invoke).toHaveBeenCalledWith("request-order-invoice", expect.objectContaining({ body: { orderId: "specific-order" } }))
  await act(async () => finish({ data: { accepted: true, email: "customer@example.test" }, error: null }))
  expect(await screen.findByRole("dialog")).toBeTruthy()
  expect(screen.getByText("customer@example.test")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Done" }))
  expect(screen.queryByRole("dialog")).toBeNull()
})
it("reports send failures without claiming success and allows retry", async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: "Please sign in again." }) } } })
  render(<RequestOrderInvoice orderId="specific-order" />)
  fireEvent.click(screen.getByRole("button", { name: "Request an invoice" }))
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Please sign in again.")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect((screen.getByRole("button", { name: "Request an invoice" }) as HTMLButtonElement).disabled).toBe(false)
})

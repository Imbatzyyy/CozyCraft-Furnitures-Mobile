import { afterEach, beforeEach, expect, it, vi } from "vitest"
const invoke = vi.hoisted(() => vi.fn())
vi.mock("./supabase", () => ({ supabase: { functions: { invoke } } }))
import { resumeOrderPayment } from "./resume-payment"
const response = () => ({ paid: false, orderId: "order-a", checkoutUrl: "https://checkout.paymongo.com/existing", expiresAt: new Date(Date.now() + 60_000).toISOString() })
beforeEach(() => { invoke.mockReset(); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true) })
afterEach(() => vi.useRealTimers())
it("reopens only the specific existing order, not a new checkout", async () => {
  const data = response()
  invoke.mockResolvedValue({ data, error: null })
  expect(await resumeOrderPayment("order-a")).toEqual(data)
  expect(invoke).toHaveBeenCalledExactlyOnceWith("resume-paymongo-checkout", { body: { orderId: "order-a" }, headers: { "x-cozycraft-platform": "mobile" } })
})
it("recognizes a payment completed on the website without opening another session", async () => {
  invoke.mockResolvedValue({ data: { paid: true, orderId: "order-a" }, error: null })
  expect(await resumeOrderPayment("order-a")).toEqual({ paid: true, orderId: "order-a" })
})
it.each([{ orderId: "order-b" }, { checkoutUrl: "https://evil.test" }, { expiresAt: "invalid" }, { expiresAt: "2020-01-01" }])("rejects invalid session data %j", async change => {
  invoke.mockResolvedValue({ data: { ...response(), ...change }, error: null })
  await expect(resumeOrderPayment("order-a")).rejects.toThrow()
})
it("surfaces the server's expired-window message", async () => {
  invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "The 15-minute payment window has expired." }), { status: 410 }) } })
  await expect(resumeOrderPayment("order-a")).rejects.toThrow("15-minute payment window")
})
it("never sends a resume request offline", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
  await expect(resumeOrderPayment("order-a")).rejects.toThrow("offline")
  expect(invoke).not.toHaveBeenCalled()
})
it("releases an unresponsive request with a bounded deadline", async () => {
  vi.useFakeTimers()
  invoke.mockReturnValue(new Promise(() => {}))
  const result = expect(resumeOrderPayment("order-a")).rejects.toThrow("too long")
  await vi.advanceTimersByTimeAsync(20_000)
  await result
})

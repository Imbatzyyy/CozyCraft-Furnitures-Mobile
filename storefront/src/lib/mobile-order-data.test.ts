import { expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock("./supabase", () => ({ supabaseUrl: "https://example.supabase.co", supabase: { from: mocks.from } }))
import { loadOrders } from "./mobile-data"
it("maps the canonical database deadline unchanged and scopes targeted reads to the owner/order", async () => {
  const queries: Array<{ table: string; calls: unknown[][] }> = []
  mocks.from.mockImplementation((table: string) => {
    const calls: unknown[][] = []
    queries.push({ table, calls })
    const result = { data: table === "orders" ? [{ id: "order-a", order_number: "CC-01999", status: "pending", payment_method: "card", payment_status: "pending", payment_expires_at: "2026-09-30T03:15:00Z", created_at: "2026-09-30T03:00:00Z", order_items: [] }] : [], error: null }
    const query: object = new Proxy({}, { get: (_target, name) => name === "then" ? (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve) : (...args: unknown[]) => { calls.push([name, ...args]); return query } })
    return query
  })
  const orders = await loadOrders("customer-a", [], ["order-a"])
  expect(orders[0]).toMatchObject({ databaseId: "order-a", payment: "card", paymentStatus: "pending", paymentExpiresAt: "2026-09-30T03:15:00Z" })
  expect(queries[0].calls).toContainEqual(["eq", "user_id", "customer-a"])
  expect(queries[0].calls).toContainEqual(["in", "id", ["order-a"]])
})

import { expect, it } from "vitest"
import { invoiceLogoAttachment } from "../../supabase/functions/_shared/invoice-logo"
import { invoiceEmail, type InvoiceOrder } from "../../supabase/functions/_shared/order-invoice"
const order: InvoiceOrder = { id: "order", order_number: "CC-01131", status: "delivered", created_at: "2026-09-07T08:00:00Z", subtotal: 20000, delivery_fee: 650, reward_discount: 500, total: 20150, payment_method: "cod", payment_status: "paid", shipping_address: { name: "Ana", line: "Manila" }, order_items: [{ id: 1, product_name: "Sofa <script>alert(1)</script>", quantity: 2, unit_price: 10000 }] }
it("renders stored order prices, fees and discount, escaping user content", () => {
  const email = invoiceEmail(order)
  expect(email.html).toContain("₱20,150.00")
  expect(email.html).toContain("₱650.00")
  expect(email.html).toContain("₱500.00")
  expect(email.html).not.toContain("<script>")
  expect(email.text).toContain("2 × ₱10,000.00")
  expect(email.subject).toContain("CC-01131")
  expect(email.html).toContain('src="cid:cozycraft-invoice-logo"')
  expect(email.html).toContain('alt="CozyCraft Furniture"')
  expect(email.html).toContain(`cid:${invoiceLogoAttachment.content_id}`)
  expect(Buffer.from(invoiceLogoAttachment.content, "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
})
it("rejects undelivered orders and inconsistent or missing amounts", () => {
  expect(() => invoiceEmail({ ...order, status: "shipped" })).toThrow(/delivered/)
  expect(() => invoiceEmail({ ...order, total: 1 })).toThrow(/review/)
  expect(() => invoiceEmail({ ...order, order_items: [] })).toThrow(/review/)
  expect(() => invoiceEmail({ ...order, subtotal: Number.NaN })).toThrow(/review/)
})

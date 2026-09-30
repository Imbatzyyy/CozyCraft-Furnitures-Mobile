import { describe, expect, it } from "vitest"
import { isAwaitingPayment, isExpiredPayment, isSecurePaymongoUrl, orderPaymentLabel, paymentDeadline, paymentTimeLabel } from "./order-payment"

const order = { databaseId: "order-a", status: "Processing", payment: "gcash", paymentStatus: "pending", paymentExpiresAt: "2026-09-30T03:15:00Z" }
describe("server-owned order payment window", () => {
  it("uses the saved deadline without restarting it", () => {
    const deadline = paymentDeadline(order)!
    expect(deadline).toBe(Date.parse(order.paymentExpiresAt))
    expect(paymentTimeLabel(deadline, Date.parse("2026-09-30T03:00:00Z"))).toBe("15:00")
    expect(paymentTimeLabel(deadline, Date.parse("2026-09-30T03:14:01Z"))).toBe("00:59")
    expect(paymentTimeLabel(deadline, deadline + 10_000)).toBe("00:00")
    expect(orderPaymentLabel(order)).toBe("Awaiting payment")
  })
  it.each([{ payment: "cod" }, { paymentStatus: "paid" }, { paymentStatus: "failed" }, { status: "Cancelled" }, { status: "Delivered" }])("does not offer payment for %j", change => {
    expect(isAwaitingPayment({ ...order, ...change })).toBe(false)
    expect(paymentDeadline({ ...order, ...change })).toBeNull()
  })
  it("handles legacy orders with no deadline without inventing a fresh 15 minutes", () => {
    expect(paymentDeadline({ ...order, paymentExpiresAt: null })).toBeNull()
    expect(paymentDeadline({ ...order, paymentExpiresAt: "invalid" })).toBeNull()
    expect(isAwaitingPayment({ ...order, paymentExpiresAt: null })).toBe(true)
  })
  it("distinguishes server expiry from ordinary cancellation", () => {
    const expired = { ...order, status: "Cancelled", paymentStatus: "failed", cancellationReason: "Payment window expired" }
    expect(isExpiredPayment(expired)).toBe(true)
    expect(orderPaymentLabel(expired)).toBe("Payment expired")
    expect(isExpiredPayment({ ...expired, cancellationReason: "Customer requested cancellation" })).toBe(false)
    expect(isExpiredPayment({ ...expired, paymentStatus: "paid" })).toBe(false)
  })
  it.each(["https://checkout.paymongo.com/session", "https://payments.paymongo.com/session"])("accepts secure checkout %s", url => expect(isSecurePaymongoUrl(url)).toBe(true))
  it.each(["http://checkout.paymongo.com/a", "https://checkout.paymongo.com.evil.test/a", "https://evil.test/a", "https://user:password@checkout.paymongo.com/a", "javascript:alert(1)", null])("rejects unsafe checkout %s", url => expect(isSecurePaymongoUrl(url)).toBe(false))
})

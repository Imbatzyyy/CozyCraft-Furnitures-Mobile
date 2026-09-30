/** The database deadline is shared with the website. Never start a new timer locally. */
export type OrderPayment = {
  databaseId?: string
  payment: string
  paymentStatus?: string
  paymentExpiresAt?: string | null
  status: string
  cancellationReason?: string | null
}

export function isAwaitingPayment(order: OrderPayment) {
  return ["card", "gcash"].includes(order.payment.toLowerCase())
    && order.paymentStatus === "pending"
    && !["cancelled", "canceled", "refunded", "delivered"].includes(order.status.toLowerCase())
}

export function paymentDeadline(order: OrderPayment) {
  const deadline = Date.parse(order.paymentExpiresAt || "")
  return isAwaitingPayment(order) && Number.isFinite(deadline) ? deadline : null
}

export function paymentTimeLabel(deadline: number, now: number) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
}

export function isExpiredPayment(order: OrderPayment) {
  return ["card", "gcash"].includes(order.payment.toLowerCase()) && order.status.toLowerCase() === "cancelled"
    && order.paymentStatus !== "paid" && /expir|payment window/i.test(order.cancellationReason || "")
}
export const orderPaymentLabel = (order: OrderPayment) => isAwaitingPayment(order) ? "Awaiting payment" : isExpiredPayment(order) ? "Payment expired" : order.status

export const ORDER_PAYMENT_REFRESH_EVENT = "cozycraft-order-payment-refresh"
export function refreshPaymentOrder(orderId: string) {
  window.dispatchEvent(new CustomEvent(ORDER_PAYMENT_REFRESH_EVENT, { detail: { orderId } }))
}

export function isSecurePaymongoUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password
      && (url.hostname === "checkout.paymongo.com" || url.hostname === "payments.paymongo.com")
  } catch { return false }
}

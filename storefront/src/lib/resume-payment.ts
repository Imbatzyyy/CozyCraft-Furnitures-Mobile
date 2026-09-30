import { supabase } from "./supabase"
import { withDeadline } from "./request-lifecycle"
import { isSecurePaymongoUrl } from "./order-payment"

export type ResumedPayment = { paid: true; orderId: string } | {
  paid: false; orderId: string; checkoutUrl: string; expiresAt: string
}

export async function resumeOrderPayment(orderId: string): Promise<ResumedPayment> {
  if (!orderId) throw new Error("Choose an order to continue payment.")
  if (navigator.onLine === false) throw new Error("You’re offline. Reconnect to continue your payment.")
  const { data, error } = await withDeadline(supabase.functions.invoke("resume-paymongo-checkout", {
    body: { orderId }, headers: { "x-cozycraft-platform": "mobile" },
  }))
  if (error || data?.error) {
    const response = (error as { context?: Response } | null)?.context
    const details = response && typeof response.clone === "function"
      ? await response.clone().json().catch(() => null) : null
    throw new Error(details?.error || data?.error || "We couldn’t reopen secure payment. Please try again.")
  }
  if (data?.orderId !== orderId) throw new Error("The payment reference did not match this order. Please try again.")
  if (data.paid === true) return { paid: true, orderId }
  if (!isSecurePaymongoUrl(data?.checkoutUrl) || !Number.isFinite(Date.parse(data?.expiresAt))) {
    throw new Error("This secure payment session is unavailable. Please refresh your orders.")
  }
  if (Date.parse(data.expiresAt) <= Date.now()) throw new Error("The payment window has ended. Please check your order status.")
  return { paid: false, orderId, checkoutUrl: data.checkoutUrl, expiresAt: data.expiresAt }
}

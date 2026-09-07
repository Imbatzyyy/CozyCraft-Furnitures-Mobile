import { useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import "./request-order-invoice.css"

export default function RequestOrderInvoice({ orderId }: { orderId: string }) {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const requestInvoice = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 60000)
    try {
      const { data, error } = await supabase.functions.invoke("request-order-invoice", { body: { orderId }, signal: controller.signal })
      if (error) {
        let message = "We couldn’t confirm the invoice email. Please try again."
        try { const body = await error.context?.json(); if (typeof body?.error === "string") message = body.error } catch { /* retain useful fallback */ }
        throw new Error(message)
      }
      if (!data?.accepted || !data?.email) throw new Error("The invoice email was not confirmed. Please try again.")
      setEmail(data.email)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again.") }
    finally { window.clearTimeout(timeout); lock.current = false; setBusy(false) }
  }
  return <div className="invoice-request">
    <button type="button" className="invoice-request-button" disabled={busy} onClick={() => void requestInvoice()}><span className="material-symbols-rounded" aria-hidden="true">receipt_long</span>{busy ? "Sending invoice…" : "Request an invoice"}</button>
    <p>Delivered to your verified account email.</p>
    {error && <p role="alert">{error}</p>}
    {email && <div className="invoice-email-overlay" role="dialog" aria-modal="true" aria-label="Invoice email confirmation" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setEmail("") } }}>
      <section className="invoice-email-card"><span className="material-symbols-rounded" aria-hidden="true">mark_email_read</span><small>YOUR ORDER, DOCUMENTED</small><h3>Your invoice is on its way.</h3><p>We’ve sent your invoice to:<strong>{email}</strong></p><p>Please allow a few minutes and check Spam if it hasn’t arrived.</p><button type="button" onClick={() => setEmail("")}>Done</button></section>
    </div>}
  </div>
}

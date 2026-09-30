import { useEffect, useRef, useState } from "react"
import useVisibleInterval from "./useVisibleInterval"
import { isAwaitingPayment, isExpiredPayment, paymentDeadline, paymentTimeLabel, refreshPaymentOrder, type OrderPayment } from "../lib/order-payment"
import "./order-payment-window.css"

export default function OrderPaymentWindow({ order, compact = false, busy = false, error = "", onResume }: {
  order: OrderPayment
  compact?: boolean
  busy?: boolean
  error?: string
  onResume: () => void
}) {
  // Only this small card ticks. Neither the storefront nor the order list is
  // re-rendered every second. No countdown tick makes a network request.
  const [now, setNow] = useState(Date.now)
  const [online, setOnline] = useState(navigator.onLine !== false)
  const deadline = paymentDeadline(order)
  const awaiting = isAwaitingPayment(order)
  const closed = isExpiredPayment(order)
  const expired = closed || (deadline !== null && deadline <= now)
  const notified = useRef("")
  useVisibleInterval(() => setNow(Date.now()), deadline !== null && !expired ? 1000 : null, true)
  useEffect(() => {
    setNow(Date.now())
    const update = () => { setNow(Date.now()); setOnline(navigator.onLine !== false) }
    const native = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === "cozycraft-native-app-active") update()
    }
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    window.addEventListener("message", native)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
      window.removeEventListener("message", native)
    }
  }, [deadline])
  useEffect(() => {
    const key = `${order.databaseId}:${deadline}`
    if (closed || !expired || !online || !order.databaseId || notified.current === key) return
    notified.current = key
    refreshPaymentOrder(order.databaseId)
  }, [closed, expired, online, order.databaseId, deadline])
  if (!awaiting && !closed) return null
  return <aside className={`order-payment-window${compact ? " order-payment-window--compact" : ""}${expired ? " is-ended" : ""}`} aria-label="Order payment window" onClick={event => event.stopPropagation()}>
    <div className="order-payment-window__heading">
      <span className="order-payment-window__icon material-symbols-rounded" aria-hidden="true">{expired ? "hourglass_disabled" : "schedule"}</span>
      <div><small>{expired ? "PAYMENT WINDOW ENDED" : "AWAITING PAYMENT"}</small><h3>{closed ? "Your reservation has ended." : expired ? "Checking the final status." : "Your pieces are reserved."}</h3></div>
      {deadline !== null && <time className="order-payment-window__clock" dateTime={order.paymentExpiresAt!} role="timer" aria-live="off" aria-label={expired ? "Payment window ended" : `${paymentTimeLabel(deadline, now)} remaining`}>{paymentTimeLabel(deadline, now)}</time>}
    </div>
    <p>{closed ? "This unpaid checkout is closed. You can start a new checkout from your bag when you’re ready." : expired ? "This checkout can no longer be resumed. We’ll update your order once the payment provider confirms its final status." : deadline === null ? "Your payment is pending. Open secure checkout to check whether it can still be completed." : `Complete your ${order.payment.toLowerCase() === "gcash" ? "GCash" : "card"} payment before the timer ends. Your deadline is the same on the website and app.`}</p>
    {!expired && <button className="order-payment-window__action" type="button" disabled={busy || !online || !order.databaseId} onClick={onResume}>
      <span>{busy ? "Opening secure payment…" : "Continue payment"}</span><span className="material-symbols-rounded" aria-hidden="true">{busy ? "hourglass_top" : "arrow_forward"}</span>
    </button>}
    {!online && <p className="order-payment-window__notice" role="status">You’re offline. Reconnect for the latest payment status.</p>}
    {error && <p className="order-payment-window__error" role="alert">{error}</p>}
    {!compact && !expired && <small className="order-payment-window__security"><span className="material-symbols-rounded" aria-hidden="true">lock</span>Secure checkout by PayMongo · No new order</small>}
  </aside>
}

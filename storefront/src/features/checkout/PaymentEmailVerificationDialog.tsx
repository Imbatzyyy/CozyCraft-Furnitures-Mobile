import { useEffect, useMemo, useState } from "react"
import {
  confirmPaymentEmailVerification,
  isCompletePaymentEmailCode,
  normalizePaymentEmailCode,
  paymentVerificationCountdown,
  paymentVerificationSecondsUntil,
  requestPaymentEmailVerification,
  type PaymentEmailAuthorization,
  type PaymentEmailChallenge,
} from "./payment-email-verification"

type PaymentEmailVerificationDialogProps = {
  challenge: PaymentEmailChallenge
  total: number
  onCancel: () => void
  onChallengeChange: (challenge: PaymentEmailChallenge) => void
  onAuthorized: (authorization: PaymentEmailAuthorization) => Promise<void>
}

const paymentLabel = (challenge: PaymentEmailChallenge) =>
  challenge.intent.paymentMethod === "gcash" ? "GCash" : "Card"

export default function PaymentEmailVerificationDialog({
  challenge,
  total,
  onCancel,
  onChallengeChange,
  onAuthorized,
}: PaymentEmailVerificationDialogProps) {
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<"" | "verify" | "resend" | "checkout">("")
  const [authorization, setAuthorization] = useState<PaymentEmailAuthorization | null>(null)
  const [now, setNow] = useState(Date.now())
  const [retryUntil, setRetryUntil] = useState(0)

  useEffect(() => {
    setCode("")
    setError("")
    setAuthorization(null)
    setRetryUntil(0)
    setNow(Date.now())
  }, [challenge.id])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const expiresRemaining = paymentVerificationSecondsUntil(challenge.expiresAt, now)
  const resendRemaining = paymentVerificationSecondsUntil(
    Math.max(challenge.resendAvailableAt, retryUntil),
    now,
  )
  const method = paymentLabel(challenge)
  const formattedTotal = useMemo(() => `₱${total.toLocaleString("en-PH")}`, [total])

  const openSecureCheckout = async (verified: PaymentEmailAuthorization) => {
    setBusy("checkout")
    setError("")
    try {
      await onAuthorized(verified)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The secure payment page could not be opened. Please try again.")
    } finally {
      setBusy("")
    }
  }

  const verify = async () => {
    if (!isCompletePaymentEmailCode(code)) {
      setError("Enter all six digits from the email.")
      return
    }
    setBusy("verify")
    setError("")
    try {
      const verified = await confirmPaymentEmailVerification(challenge, code)
      setAuthorization(verified)
      await openSecureCheckout(verified)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The payment code could not be verified.")
    } finally {
      setBusy("")
    }
  }

  const resend = async () => {
    if (resendRemaining > 0 || busy) return
    setBusy("resend")
    setError("")
    try {
      const next = await requestPaymentEmailVerification(challenge.intent)
      onChallengeChange(next)
    } catch (cause) {
      const retryAfter = cause && typeof cause === "object" && "retryAfter" in cause
        ? Number((cause as { retryAfter?: number }).retryAfter) || 0
        : 0
      if (retryAfter > 0) setRetryUntil(Date.now() + retryAfter * 1_000)
      setError(cause instanceof Error ? cause.message : "A new payment code could not be sent.")
    } finally {
      setBusy("")
    }
  }

  return (
    <section className="payment-verification-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-verification-title">
      <div className="payment-verification-card">
        <header>
          <span className="payment-verification-mark material-symbols-rounded" aria-hidden="true">shield_lock</span>
          <div>
            <small>SECURE PAYMENT</small>
            <h2 id="payment-verification-title">Check your email.</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={Boolean(busy)} aria-label="Cancel payment verification">
            <span className="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </header>

        <p className="payment-verification-lead">
          We sent a six-digit code to <b>{challenge.maskedEmail}</b>. Enter it here before we open PayMongo.
        </p>

        <dl className="payment-verification-summary">
          <div><dt>Payment</dt><dd>{method}</dd></div>
          <div><dt>Order total</dt><dd>{formattedTotal}</dd></div>
        </dl>

        {authorization ? (
          <div className="payment-verification-approved" role="status">
            <span className="material-symbols-rounded" aria-hidden="true">verified_user</span>
            <div><b>Email confirmed</b><small>Your authorization is tied to this checkout only.</small></div>
          </div>
        ) : (
          <label className="payment-verification-code">
            <span>PAYMENT CODE</span>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="done"
              maxLength={6}
              value={code}
              disabled={Boolean(busy) || expiresRemaining === 0}
              onChange={(event) => {
                setCode(normalizePaymentEmailCode(event.target.value))
                setError("")
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isCompletePaymentEmailCode(code) && !busy) void verify()
              }}
              aria-describedby="payment-verification-timer"
              aria-invalid={Boolean(error)}
            />
          </label>
        )}

        <div className="payment-verification-meta" id="payment-verification-timer">
          <span className="material-symbols-rounded" aria-hidden="true">schedule</span>
          <span>{authorization ? "Verified for this payment attempt" : expiresRemaining > 0 ? `Code expires in ${paymentVerificationCountdown(expiresRemaining)}` : "This code has expired"}</span>
          <button type="button" disabled={resendRemaining > 0 || Boolean(busy)} onClick={() => void resend()}>
            {busy === "resend" ? "Sending…" : resendRemaining > 0 ? `Resend in ${resendRemaining}s` : "Send a new code"}
          </button>
        </div>

        {error && <p className="payment-verification-error" role="alert">
          <span className="material-symbols-rounded" aria-hidden="true">error</span>
          {error}
        </p>}

        <button
          type="button"
          className="payment-verification-primary"
          disabled={Boolean(busy) || (!authorization && (!isCompletePaymentEmailCode(code) || expiresRemaining === 0))}
          onClick={() => authorization ? void openSecureCheckout(authorization) : void verify()}
        >
          {busy === "verify" ? "Checking code…" : busy === "checkout" ? "Opening PayMongo…" : authorization ? "Try secure checkout again" : "Verify and continue"}
          {!busy && <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>}
        </button>

        <aside>
          <span className="material-symbols-rounded" aria-hidden="true">lock</span>
          <p><b>One checkout only.</b> This code never reveals or stores your GCash or card details.</p>
        </aside>
      </div>
    </section>
  )
}

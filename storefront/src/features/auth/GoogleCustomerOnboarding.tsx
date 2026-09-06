import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { MobileGoogleOnboardingStatus } from "./google-customer-onboarding"

export function customerInitials(value: string) {
  const initials = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toLocaleUpperCase("en-PH") || "")
    .slice(0, 2)
    .join("")
  return initials || "C"
}

export default function GoogleCustomerOnboarding({
  status,
  displayName,
  complete,
  dismissVoucher,
  startShopping,
}: {
  status: MobileGoogleOnboardingStatus
  displayName: string
  complete: (username: string) => Promise<void>
  dismissVoucher: () => Promise<void>
  startShopping: () => Promise<void>
}) {
  const [username, setUsername] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const latest = useRef({ status, busy, dismissVoucher })
  latest.current = { status, busy, dismissVoucher }
  const voucher = status.showVoucher ? status.voucher : null
  const modalOpen = status.needsUsername || Boolean(voucher)

  useEffect(() => {
    setUsername(status.username)
    setBusy(false)
    setError("")
  }, [status.userId, status.needsUsername, status.showVoucher, status.username])

  useEffect(() => {
    if (!status.needsUsername) return
    const frame = window.requestAnimationFrame(() => input.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [status.needsUsername])

  useEffect(() => {
    // The component remains mounted after the one-time voucher is dismissed.
    // Only lock the storefront while a visible onboarding step exists, then
    // immediately release `inert` and scroll locking when the last step closes.
    if (!modalOpen) return
    const root = document.getElementById("root")
    const wasInert = root?.inert ?? false
    const previouslyFocused = document.activeElement as HTMLElement | null
    if (root) root.inert = true
    document.documentElement.classList.add("google-onboarding-open")
    document.body.classList.add("google-onboarding-open")

    const focusDialog = () => {
      if (latest.current.status.needsUsername) input.current?.focus()
      else dialog.current?.focus()
    }
    const frame = window.requestAnimationFrame(focusDialog)
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!latest.current.status.needsUsername && !latest.current.busy) {
          void latest.current.dismissVoucher()
        } else {
          focusDialog()
        }
        return
      }
      if (event.key !== "Tab") return
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
      ) ?? [])
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) {
        event.preventDefault()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const nativeBack = (event: MessageEvent) => {
      if (event.data?.type !== "cozycraft-native-back" || event.source !== window.parent) return
      event.stopImmediatePropagation()
      if (!latest.current.status.needsUsername && !latest.current.busy) {
        void latest.current.dismissVoucher()
      } else {
        focusDialog()
      }
    }
    document.addEventListener("keydown", keyboard, true)
    window.addEventListener("message", nativeBack, true)
    return () => {
      window.cancelAnimationFrame(frame)
      if (root) root.inert = wasInert
      document.documentElement.classList.remove("google-onboarding-open")
      document.body.classList.remove("google-onboarding-open")
      document.removeEventListener("keydown", keyboard, true)
      window.removeEventListener("message", nativeBack, true)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [modalOpen, status.userId, status.needsUsername])

  if (!modalOpen) return null

  const saveUsername = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = username.trim()
    if (!/^[A-Za-z0-9._-]{3,24}$/.test(normalized)) {
      setError("Use 3–24 letters, numbers, dots, underscores, or hyphens.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await complete(normalized)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your username could not be saved. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const continueFromVoucher = async (shop: boolean) => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      if (shop) await startShopping()
      else await dismissVoucher()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.")
      setBusy(false)
    }
  }

  return createPortal(
    <section
      ref={dialog}
      className="google-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-onboarding-title"
      tabIndex={-1}
    >
      {status.needsUsername ? (
        <form className="google-onboarding-card username-step" onSubmit={saveUsername} noValidate>
          <div className="google-onboarding-monogram" aria-hidden="true">
            {customerInitials(displayName)}
          </div>
          <p className="google-onboarding-eyebrow">WELCOME TO COZYCRAFT</p>
          <h1 id="google-onboarding-title">Make this account <em>yours.</em></h1>
          <p className="google-onboarding-lead">
            Choose the username you want CozyCraft to show. We’ll use initials until you personally add a profile photo.
          </p>
          <label htmlFor="google-onboarding-username">
            <span>Username</span>
            <input
              ref={input}
              id="google-onboarding-username"
              value={username}
              onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24))}
              minLength={3}
              maxLength={24}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="cozyhome"
              aria-describedby="google-onboarding-username-help"
            />
          </label>
          <p id="google-onboarding-username-help" className="google-onboarding-help">
            Your photo and verified mobile number remain empty until you add them in My Profile.
          </p>
          {error && <p className="google-onboarding-error" role="alert">{error}</p>}
          <button className="google-onboarding-primary" type="submit" disabled={busy || username.trim().length < 3}>
            {busy ? "Saving your username…" : "Continue to CozyCraft"}
            {!busy && <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>}
          </button>
          <small className="google-onboarding-footnote">Usernames are unique and can be changed later from My Profile.</small>
        </form>
      ) : voucher ? (
        <div className="google-onboarding-card voucher-step">
          <div className="welcome-voucher-mark" aria-hidden="true">✦</div>
          <p className="google-onboarding-eyebrow">A WELCOME FOR YOUR HOME</p>
          <h1 id="google-onboarding-title">Your first reward <em>has arrived.</em></h1>
          <p className="google-onboarding-lead">
            Enjoy a little something from us as you begin your CozyCraft home.
          </p>
          <section className="welcome-voucher-ticket" aria-label={`Welcome voucher worth ${voucher.discountAmount} pesos`}>
            <div>
              <small>WELCOME REWARD</small>
              <strong><span>₱</span>{voucher.discountAmount.toLocaleString("en-PH")}</strong>
              <p>OFF YOUR ORDER</p>
            </div>
            <dl>
              <div><dt>Minimum order</dt><dd>₱{voucher.minimumOrderAmount.toLocaleString("en-PH")}</dd></div>
              <div><dt>Valid until</dt><dd>{new Date(voucher.expiresAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</dd></div>
              <div><dt>Voucher</dt><dd>{voucher.code}</dd></div>
            </dl>
          </section>
          <p className="welcome-voucher-note">
            It is already saved to Home Circle and will appear automatically among your available checkout rewards.
          </p>
          {error && <p className="google-onboarding-error" role="alert">{error}</p>}
          <button className="google-onboarding-primary" type="button" disabled={busy} onClick={() => void continueFromVoucher(true)}>
            {busy ? "Preparing the collection…" : "Start shopping"}
            {!busy && <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>}
          </button>
          <button className="google-onboarding-secondary" type="button" disabled={busy} onClick={() => void continueFromVoucher(false)}>
            Keep it for later
          </button>
        </div>
      ) : null}
    </section>,
    document.body,
  )
}

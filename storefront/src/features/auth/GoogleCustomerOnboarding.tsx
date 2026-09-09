import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import CozyCompanion from "../../components/CozyCompanion"
import type { MobileGoogleOnboardingStatus } from "./google-customer-onboarding"
import { clearGoogleOnboardingDraft, readGoogleOnboardingDraft, saveGoogleOnboardingDraft } from "./google-onboarding-draft"

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

type OnboardingProps = {
  status: MobileGoogleOnboardingStatus
  displayName: string
  complete: (username: string, name?: { firstName: string; lastName: string }) => Promise<void>
  dismissVoucher: () => Promise<void>
  startShopping: () => Promise<void>
}

export default function GoogleCustomerOnboarding(props: OnboardingProps) {
  return <GoogleOnboardingForm key={props.status.userId} {...props} />
}

function GoogleOnboardingForm({
  status,
  displayName,
  complete,
  dismissVoucher,
  startShopping,
}: OnboardingProps) {
  const [initial] = useState(() => readGoogleOnboardingDraft(status.userId, displayName, status.username))
  const [username, setUsername] = useState(initial.username)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [nameConfirmed, setNameConfirmed] = useState(initial.nameConfirmed)
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const input = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const dialog = useRef<HTMLElement>(null)
  const latest = useRef({ status, busy, dismissVoucher })
  latest.current = { status, busy, dismissVoucher }
  const voucher = status.showVoucher ? status.voucher : null
  const modalOpen = status.needsUsername || Boolean(voucher)

  useEffect(() => {
    if (status.needsUsername) saveGoogleOnboardingDraft({ userId: status.userId, username, firstName, lastName, nameConfirmed })
    else clearGoogleOnboardingDraft(status.userId)
  }, [status.userId, status.needsUsername, username, firstName, lastName, nameConfirmed])

  useEffect(() => {
    // A successfully dismissed voucher can be reopened after a retry/replay.
    // Reset only this phase's request state, never the signup draft.
    if (!status.needsUsername) {
      setBusy(false)
      setError("")
      submitting.current = false
    }
  }, [status.needsUsername, status.showVoucher])

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
          void latest.current.dismissVoucher().catch(() => setError("Couldn’t save this yet. Please try again."))
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
        void latest.current.dismissVoucher().catch(() => setError("Couldn’t save this yet. Please try again."))
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
    if (submitting.current) return
    if (!nameConfirmed) {
      if (!firstName.trim() || !lastName.trim()) { setError("Enter your first and last name."); return }
      setError("")
      setNameConfirmed(true)
      return
    }
    const normalized = username.trim()
    if (!/^[A-Za-z0-9._-]{3,24}$/.test(normalized)) {
      setError("Use 3–24 letters, numbers, dots, underscores, or hyphens.")
      return
    }
    setBusy(true)
    submitting.current = true
    setError("")
    try {
      await complete(normalized, { firstName: firstName.trim(), lastName: lastName.trim() })
      clearGoogleOnboardingDraft(status.userId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your username could not be saved. Please try again.")
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const continueFromVoucher = async (shop: boolean) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError("")
    try {
      if (shop) await startShopping()
      else await dismissVoucher()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.")
    } finally {
      submitting.current = false
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
          {nameConfirmed && <button type="button" className="google-onboarding-secondary" disabled={busy} onClick={() => setNameConfirmed(false)}>← Back</button>}
          <div key={nameConfirmed ? "username" : "name"} className="signup-slide">
            <CozyCompanion pose={nameConfirmed ? "signup-username" : "signup-name"} />
          </div>
          <p className="google-onboarding-eyebrow">STEP {nameConfirmed ? "2" : "1"} OF 2</p>
          <h1 id="google-onboarding-title">{nameConfirmed ? "Make it yours." : "A warm welcome."}</h1>
          <p className="google-onboarding-lead">
            {nameConfirmed ? "Choose a username that feels like you." : "Is this how we should call you?"}
          </p>
          {!nameConfirmed ? <>
            <label>First name<input ref={input} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" /></label>
            <label>Last name<input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" /></label>
          </> : <><label htmlFor="google-onboarding-username">
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
            3–24 letters, numbers, dots, underscores, or hyphens.
          </p></>}
          {error && <p className="google-onboarding-error" role="alert">{error}</p>}
          <button className="google-onboarding-primary" type="submit" disabled={busy || (nameConfirmed && username.trim().length < 3)}>
            {busy ? "Saving your account…" : nameConfirmed ? "Continue to CozyCraft" : "Continue"}
            {!busy && <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>}
          </button>
          <small className="google-onboarding-footnote">You can update these details in My Profile.</small>
        </form>
      ) : voucher ? (
        <div className="google-onboarding-card voucher-step">
          <CozyCompanion pose="tour-voucher" compact />
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

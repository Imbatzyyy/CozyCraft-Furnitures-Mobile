import { useEffect, useRef, useState, type ReactNode } from "react"
import { enterGuestMode, isGuestMode, supabase } from "../../lib/supabase"
import { authenticatorChallengeRequired, shouldRecheckAuthenticator, syncMobileDeviceSession } from "./account-security"
import { isSixDigitOtp, normalizeOtp } from "../profile/phone-verification"
import "../profile/profile-security.css"

type Access = { kind: "checking" | "allowed" | "error"; message?: string } | { kind: "challenge"; factorId: string }

export default function CustomerSecurityGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access>({ kind: "checking" })
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const alive = useRef(false)
  const generation = useRef(0)
  const verifying = useRef(false)
  const lastCheck = useRef(0)
  const pending = useRef<Promise<void> | null>(null)
  const retryAfterPending = useRef(false)
  const currentIdentity = useRef("")

  const check = (force = false) => {
    if (pending.current) { retryAfterPending.current ||= force; return pending.current }
    if (!force && Date.now() - lastCheck.current < 30_000) return Promise.resolve()
    lastCheck.current = Date.now()
    const version = ++generation.current
    const current = () => alive.current && generation.current === version
    pending.current = (async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (!current()) return
        if (sessionError) throw sessionError
        if (!session || isGuestMode()) {
          if (currentIdentity.current && !isGuestMode()) {
            setAccess({ kind: "checking" })
            window.location.hash = "#/sign-in"
          } else setAccess({ kind: "allowed" })
          currentIdentity.current = ""
          return
        }
        if (currentIdentity.current && currentIdentity.current !== session.user.id) setAccess({ kind: "checking" })
        currentIdentity.current = session.user.id
        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (assuranceError || !assurance) throw assuranceError || new Error("Your account security could not be checked.")
        if (!current()) return
        // Offline browsing can use this account's existing local session and
        // cached catalog. Protected mutations already require a connection.
        // Never skip an authenticator challenge that the session requires.
        if (navigator.onLine === false) {
          if (authenticatorChallengeRequired(assurance.currentLevel, assurance.nextLevel)) {
            throw new Error("Reconnect to complete two-step verification for this account.")
          }
          setAccess({ kind: "allowed" })
          return
        }
        const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors()
        if (factorError) throw factorError
        if (!current()) return
        const factor = factors?.totp.find((item) => item.status === "verified")
        const requiresChallenge = authenticatorChallengeRequired(assurance.currentLevel, factor ? "aal2" : assurance.nextLevel)
        if (requiresChallenge) {
          if (!factor) throw new Error("Your authenticator could not be loaded. Retry or sign in again.")
          setAccess({ kind: "challenge", factorId: factor.id })
          return
        }
        if (!(await syncMobileDeviceSession(session))) {
          if (!current()) return
          await enterGuestMode()
          window.location.hash = "#/sign-in?reason=session-ended"
          return
        }
        if (current()) { setCode(""); setError(""); setAccess({ kind: "allowed" }) }
      } catch (cause) {
        if (current()) setAccess({ kind: "error", message: cause instanceof Error ? cause.message : "Your account security could not be checked. Please retry." })
      } finally {
        pending.current = null
        if (retryAfterPending.current && alive.current) {
          retryAfterPending.current = false
          void check(true)
        }
      }
    })()
    return pending.current
  }

  useEffect(() => {
    alive.current = true
    void check(true)
    const timers = new Set<number>()
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!shouldRecheckAuthenticator(event)) return
      // Defer Auth calls until Supabase releases its session lock.
      const timer = window.setTimeout(() => { timers.delete(timer); void check(true) }, 0)
      timers.add(timer)
    })
    const resume = () => { if (document.visibilityState === "visible") void check() }
    const nativeResume = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === "cozycraft-native-app-active") resume()
    }
    window.addEventListener("focus", resume)
    window.addEventListener("online", resume)
    document.addEventListener("visibilitychange", resume)
    window.addEventListener("message", nativeResume)
    return () => {
      alive.current = false
      generation.current += 1
      timers.forEach((timer) => window.clearTimeout(timer))
      subscription.subscription.unsubscribe()
      window.removeEventListener("focus", resume)
      window.removeEventListener("online", resume)
      document.removeEventListener("visibilitychange", resume)
      window.removeEventListener("message", nativeResume)
    }
  }, [])

  const verify = async () => {
    if (access.kind !== "challenge" || verifying.current || !isSixDigitOtp(code)) return
    if (navigator.onLine === false) { setError("Reconnect to verify your authenticator code."); return }
    verifying.current = true
    setBusy(true)
    setError("")
    try {
      const { error: verificationError } = await supabase.auth.mfa.challengeAndVerify({ factorId: access.factorId, code })
      if (verificationError) throw new Error("That authenticator code is incorrect or expired. Enter the latest code from your authenticator app.")
      await check(true)
    } catch (cause) {
      if (alive.current) { setCode(""); setError(cause instanceof Error ? cause.message : "Verification could not finish. Please try again.") }
    } finally { verifying.current = false; if (alive.current) setBusy(false) }
  }

  if (access.kind === "allowed") return children
  return <main className="mobile-auth-check">
    <section className="mobile-security-dialog">
      <div className="mobile-security-body">
        <span className="mobile-security-icon" aria-hidden="true">{access.kind === "checking" ? <span className="mobile-security-spinner"/> : "✓"}</span>
        <p className="mobile-auth-eyebrow">COZYCRAFT · ACCOUNT SECURITY</p>
        <h1>{access.kind === "challenge" ? "Confirm it’s you." : access.kind === "error" ? "Let’s reconnect securely." : "Checking your account."}</h1>
        {access.kind === "challenge" ? <form onSubmit={(event) => { event.preventDefault(); void verify() }}>
          <p>Your account has two-step verification enabled. Enter the six-digit code from your authenticator app to continue.</p>
          <label className="mobile-otp-label" htmlFor="mobile-authenticator-code">Authenticator code</label>
          <input id="mobile-authenticator-code" className="mobile-otp-input" autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            pattern="[0-9]{6}" value={code} onChange={(event) => { setCode(normalizeOtp(event.target.value)); setError("") }} disabled={busy} />
          {error && <p role="alert" className="mobile-security-error">{error}</p>}
          <button type="submit" className="mobile-security-primary" disabled={busy || !isSixDigitOtp(code)}>{busy ? "Verifying…" : "Verify and continue"}</button>
        </form> : access.kind === "error" ? <>
          <p role="alert">{access.message}</p>
          <button type="button" className="mobile-security-primary" onClick={() => { setAccess({ kind: "checking" }); void check(true) }}>Retry secure check</button>
        </> : <p>Preparing your protected CozyCraft account…</p>}
        {access.kind !== "checking" && <button type="button" className="mobile-security-text" disabled={busy}
          onClick={() => void enterGuestMode().then(() => { window.location.hash = "#/sign-in" })}>Use another account</button>}
      </div>
    </section>
  </main>
}

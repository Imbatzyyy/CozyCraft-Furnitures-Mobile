import { localStore } from "./lib/browser-storage"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import CozyCompanion, { type CompanionPose } from "./components/CozyCompanion"
import useStepTransition from "./components/useStepTransition"
import { readManualSignupDraft, saveManualSignupDraft, clearManualSignupDraft } from "./features/auth/manual-signup-draft"
import "./features/auth/signup-journey.css"
import useVisibleInterval from "./components/useVisibleInterval"
import AppInformation from "./features/navigation/AppInformation"
import { APP_INFO_LABELS, type AppInfoSection } from "./features/navigation/app-navigation-data"
import PolicyContent from "./features/navigation/PolicyContent"
import { MOBILE_POLICY_VERSION } from "./features/navigation/legal-content"
import "./features/navigation/app-navigation.css"
import CozyLaunchScreen from "./components/CozyLaunchScreen"
import SofaLaunchSequence from "./components/SofaLaunchSequence"
import { hasLaunchHandoff, readLaunchPace } from "./components/launch-handoff"
import { createHashRouter, Link, Navigate, useLocation, useNavigate } from "react-router"
import CustomerSecurityGate from "./features/auth/CustomerSecurityGate"
import { googleOAuthOptions } from "./features/auth/google-oauth"
import cozyLogo from "./imports/COZy.png"
import googleMark from "./assets/google-g.ico"
import { clearMobileCustomerCache, enterGuestMode, isGuestMode, leaveGuestMode, mobileRedirectUrl, supabase, verifyCustomerSession } from "./lib/supabase"
import { acceptCurrentMobilePolicies } from "./lib/mobile-data"

const Storefront = lazy(() => import("./Storefront"))

const MOBILE_POLICY_PENDING_KEY = "cozycraft-mobile-policy-consent-pending"

async function finishPendingPolicyAcceptance() {
  if (localStore.getItem(MOBILE_POLICY_PENDING_KEY) !== MOBILE_POLICY_VERSION) return
  await acceptCurrentMobilePolicies("mobile_signup")
  localStore.removeItem(MOBILE_POLICY_PENDING_KEY)
}

function Mark() {
  return (
    <div className="auth-mark">
      <img src={cozyLogo} alt="CozyCraft Furniture" width="469" height="156" />
    </div>
  )
}

function DocumentHeader({ label, back }: { label: string; back: () => void }) {
  return <header className="document-header">
    <button type="button" onClick={back} aria-label="Go back">
      <span className="material-symbols-rounded" aria-hidden="true">arrow_back</span>
    </button>
    <Mark />
    <span className="document-header-label">{label}</span>
  </header>
}
function BackLink() {
  return (
    <Link className="back-link" to="/welcome" aria-label="Back to welcome">
      ← <span>Back</span>
    </Link>
  )
}

function LegalDocument({ kind }: { kind: "terms" | "privacy" }) {
  const nav = useNavigate()
  return <main className="auth-phone legal-document">
    <DocumentHeader label={kind === "terms" ? "TERMS" : "PRIVACY"} back={() => nav(-1)} />
    <PolicyContent kind={kind}/>
    <footer><button type="button" onClick={() => nav(-1)}>Done reading</button></footer>
  </main>
}

function ContentDocument({ kind }: { kind: "about" | "contact" }) {
  const nav = useNavigate()
  const [section, setSection] = useState<AppInfoSection>(kind)
  return <main className="auth-phone legal-document ccnav-standalone">
    <DocumentHeader label={APP_INFO_LABELS[section]} back={() => nav(-1)}/>
    <AppInformation key={section} section={section} changeSection={setSection} shop={() => nav("/shop")} support={() => nav("/shop", { state: { openSupport: true } })}/>
    <footer><button type="button" onClick={() => nav(-1)}>Done reading</button></footer>
  </main>
}
function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  hint?: string
}) {
  const [show, setShow] = useState(false)
  const password = type === "password"
  return (
    <label className="field">
      <span>{label}</span>
      <div>
        <input
          required
          type={password && show ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  )
}
function Splash() {
  const navigate = useNavigate()
  const [destination, setDestination] = useState("/welcome")
  const [showSofa, setShowSofa] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [pace] = useState(readLaunchPace)
  useEffect(() => {
    let active = true
    let timer: number | undefined
    const startedAt = Date.now()
    // The brand splash is a first-launch moment; returning customers pass through.
    const splashHold = pace === "quick" ? 450 : 1850

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const nextDestination = data.session?.user && !isGuestMode() ? "/shop" : "/welcome"
      setDestination(nextDestination)
      setSessionReady(true)
      const remaining = Math.max(0, splashHold - (Date.now() - startedAt))
      timer = window.setTimeout(() => setShowSofa(true), remaining)
    }).catch(() => {
      if (!active) return
      setSessionReady(true)
      timer = window.setTimeout(() => setShowSofa(true), Math.max(0, splashHold - (Date.now() - startedAt)))
    })

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [navigate, pace])
  const finishLaunch = () => navigate(destination, { replace: true })
  if (showSofa) {
    if (destination === "/shop") return <Navigate to="/shop" replace state={{ sofaLaunch: true }} />
    return <SofaLaunchSequence onComplete={finishLaunch} pace={pace} />
  }
  return (
    <main className="auth-phone splash">
      <div className="splash-orbit orbit-one" />
      <div className="splash-orbit orbit-two" />
      <div className="splash-glass" />
      <div className="splash-content">
        <p className="splash-overline">ESTD 2026</p>
        <Mark />
        <div className="splash-rule" />
        <p className="splash-line">
          Furniture for a life
          <br />
          <em>well lived.</em>
        </p>
      </div>
      <div className="splash-footer">
        <div
          className="splash-loader"
          role="progressbar"
          aria-label="Loading CozyCraft"
        >
          <i />
        </div>
        <button disabled={!sessionReady} onClick={() => setShowSofa(true)}>
          Enter CozyCraft <span>→</span>
        </button>
      </div>
    </main>
  )
}
function Welcome() {
  const navigate = useNavigate()
  const [enteringGuest, setEnteringGuest] = useState(false)
  const [welcomeSlide, setWelcomeSlide] = useState(0)
  const [welcomeTouchStart, setWelcomeTouchStart] = useState<number | null>(null)
  const welcomeShowcases = [
    { image: "./furniture/photo-1599696848652-f0ff23bc911f.jpg", alt: "A serene warm-toned living room with a sculptural sofa", label: "THE LIVING EDIT · 2026" },
    { image: "./furniture/photo-1600210492486-724fe5c67fb0.jpg", alt: "A calm contemporary bedroom arranged for restorative rest", label: "THE BEDROOM EDIT · 2026" },
    { image: "./furniture/photo-1617806118233-18e1de247200.jpg", alt: "A considered dining space designed for gathering", label: "THE DINING EDIT · 2026" },
  ]
  useEffect(() => {
    welcomeShowcases.forEach(({ image: source }) => {
      const image = new Image()
      image.src = source
    })
  }, [])
  useVisibleInterval(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setWelcomeSlide((current) => (current + 1) % welcomeShowcases.length)
  }, 5000)
  const moveWelcome = (direction: number) => {
    setWelcomeSlide((current) => (current + direction + welcomeShowcases.length) % welcomeShowcases.length)
  }
  const browseAsGuest = async () => {
    if (enteringGuest) return
    setEnteringGuest(true)
    try {
      await enterGuestMode()
      navigate("/shop", { replace: true })
    } finally {
      setEnteringGuest(false)
    }
  }
  return (
    <main className="auth-phone welcome">
      <div
        className="welcome-art welcome-carousel"
        onTouchStart={(event) => setWelcomeTouchStart(event.touches[0].clientX)}
        onTouchEnd={(event) => {
          if (welcomeTouchStart === null) return
          const distance = event.changedTouches[0].clientX - welcomeTouchStart
          if (Math.abs(distance) > 42) moveWelcome(distance > 0 ? -1 : 1)
          setWelcomeTouchStart(null)
        }}
      >
        <div className="welcome-slides" aria-live="polite">
          {welcomeShowcases.map((showcase, index) => (
            <img src={showcase.image} alt={showcase.alt} className={index === welcomeSlide ? "active" : ""} aria-hidden={index !== welcomeSlide} key={showcase.image} />
          ))}
        </div>
        <div className="welcome-glass-logo">
          <Mark />
          <span>{welcomeShowcases[welcomeSlide].label}</span>
        </div>
        <div className="welcome-pagination" aria-label="Welcome showcase slides">
          {welcomeShowcases.map((showcase, index) => (
            <button type="button" className={index === welcomeSlide ? "active" : ""} onClick={() => setWelcomeSlide(index)} aria-label={`Show ${showcase.label.toLowerCase()}`} aria-current={index === welcomeSlide ? "true" : undefined} key={showcase.image} />
          ))}
        </div>
        <p className="welcome-index">{String(welcomeSlide + 1).padStart(2, "0")} / {String(welcomeShowcases.length).padStart(2, "0")}</p>
      </div>
      <section className="welcome-panel">
        <p className="eyebrow-auth">FURNITURE, CONSIDERED</p>
        <h1>
          Live beautifully.
          <br />
          <em>Rest deeply.</em>
        </h1>
        <p className="intro">
          Exceptional pieces for the everyday rituals that make a house feel
          like home.
        </p>
        <div className="welcome-actions">
          <Link to="/create-account" className="auth-primary">
            CREATE ACCOUNT <b>→</b>
          </Link>
          <Link to="/sign-in" className="auth-secondary">
            I ALREADY HAVE AN ACCOUNT
          </Link>
          <button type="button" className="guest-entry" onClick={() => void browseAsGuest()} disabled={enteringGuest}>
            {enteringGuest ? "Preparing guest mode…" : "Browse as guest"} <span>→</span>
          </button>
        </div>
        <p className="legal">
          By continuing, you agree to our <Link to="/terms">Terms</Link> and{" "}
          <Link to="/privacy-policy">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  )
}
function SignIn() {
  const nav = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [notice, setNotice] = useState("")
  const [noticeKind, setNoticeKind] = useState<"error" | "success">("error")
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(true)

  useEffect(() => {
    if (new URLSearchParams(location.search).get("reason") === "callback-failed") {
      setNoticeKind("error")
      setNotice("The sign-in link couldn’t finish. Please start sign-in again to get a fresh secure link.")
    }
    if (new URLSearchParams(location.search).get("reason") === "invalid-login") {
      setNoticeKind("error")
      setNotice("Incorrect email or password. Please check your credentials.")
    }
  }, [location.search])

  useEffect(() => {
    let active = true
    void supabase
      .from("store_settings")
      .select("account_settings")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        const settings = data?.account_settings as Record<string, unknown> | undefined
        setGoogleEnabled(settings?.google_auth_enabled !== false)
      })
    return () => { active = false }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNoticeKind("error")
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !password) {
      setNotice("Enter your email address and password to continue.")
      return
    }
    setBusy(true)
    setNotice("")
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error || !data.user) {
      setBusy(false)
      setPassword("")
      setNotice("Incorrect email or password. Please check your credentials.")
      return
    }
    const customer = await verifyCustomerSession(data.user.id)
    if (!customer) {
      setBusy(false)
      setPassword("")
      setNotice("Incorrect email or password. Please check your credentials.")
      return
    }
    clearMobileCustomerCache()
    leaveGuestMode()
    await finishPendingPolicyAcceptance().catch((cause) => {
      console.warn("Policy acceptance will retry after sign-in", cause)
    })
    setBusy(false)
    nav("/shop", { replace: true })
  }

  const sendReset = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    setNoticeKind("error")
    setNotice("")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice("Enter a valid account email address.")
      return
    }
    setBusy(true)
    localStore.setItem("cozycraft-auth-intent", "recovery")
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: mobileRedirectUrl(),
    })
    setBusy(false)
    if (error) {
      localStore.removeItem("cozycraft-auth-intent")
      setNotice(error.message.toLowerCase().includes("rate limit")
        ? "Too many reset requests. Please wait a few minutes and try again."
        : "We could not send the reset email. Please try again shortly.")
      return
    }
    setNoticeKind("success")
    setNotice("If this email belongs to a CozyCraft account, a secure reset link is on its way.")
  }
  return (
    <main className="auth-phone form-page deluxe-signin">
      <header className="signin-top">
        <BackLink />
        <span>RETURNING MEMBER</span>
      </header>
      <section className="signin-intro">
        <Mark />
        <p className="eyebrow-auth">{forgot ? "ACCOUNT RECOVERY" : "WELCOME BACK"}</p>
        <h1>
          {forgot ? "Find your" : "Your home"}
          <br />
          <em>{forgot ? "way back." : "is waiting."}</em>
        </h1>
        <p className="intro">
          {forgot
            ? "Enter your account email and we’ll send a secure password-reset link."
            : "Sign in to return to your saved pieces, order updates, and Home Circle benefits."}
        </p>
      </section>
      <section className="signin-form-card">
        <div className="signin-security-note">
          <span>⌾</span>
          <p><b>{forgot ? "Private recovery" : "Customer account"}</b><small>{forgot ? "Reset links are time-limited and single-use." : "Protected by encrypted authentication and role verification."}</small></p>
        </div>
        <form onSubmit={forgot ? sendReset : submit} noValidate>
          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          {!forgot && <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />}
          {!forgot && <div className="form-options signin-options">
            <span>Use your CozyCraft customer account.</span>
            <button
              type="button"
              onClick={() => { setForgot(true); setPassword(""); setNotice("") }}
            >
              Forgot password?
            </button>
          </div>}
          <button className="auth-primary" type="submit" disabled={busy}>
            {busy ? (forgot ? "SENDING SECURE LINK…" : "VERIFYING ACCOUNT…") : (forgot ? "SEND RESET LINK" : "SIGN IN TO COZYCRAFT")} <b>→</b>
          </button>
          {notice && (
            <p className={`form-notice ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"}>
              {notice}
            </p>
          )}
        </form>
        {forgot ? (
          <button className="signin-back-button" type="button" onClick={() => { setForgot(false); setNotice("") }}>
            ← Return to sign in
          </button>
        ) : googleEnabled && <><div className="or">
          <span />
          or continue with
          <span />
        </div>
        <button
          className="google"
          onClick={async () => {
            clearMobileCustomerCache()
            leaveGuestMode()
            setNotice("")
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: googleOAuthOptions(mobileRedirectUrl()),
            })
            if (error) {
              setNoticeKind("error")
              setNotice("Google sign-in could not be started. Please try again.")
            }
            else if (data.url && window.parent !== window) {
              window.parent.postMessage({ type: "cozycraft-open-oauth", url: data.url }, "*")
            }
          }}
        >
          <img src={googleMark} alt="" aria-hidden="true" />
          Continue with Google
        </button>
        </>}
        <p className="switch-auth">
          New here? <Link to="/create-account">Create your account</Link>
        </p>
      </section>
    </main>
  )
}

function ResetPassword() {
  const nav = useNavigate()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [notice, setNotice] = useState("")
  const [noticeKind, setNoticeKind] = useState<"error" | "success">("error")
  const [busy, setBusy] = useState(false)
  const strong = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setNoticeKind("error")
    setNotice("")
    if (!strong) {
      setNotice("Use at least 8 characters with uppercase and lowercase letters, a number, and a symbol.")
      return
    }
    if (password !== confirm) {
      setNotice("Passwords do not match. Please try again.")
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setNotice(error.message.toLowerCase().includes("session")
        ? "This reset link is invalid or has expired. Request a new link from sign in."
        : "Your password could not be updated. Please try again.")
      return
    }
    setNoticeKind("success")
    setNotice("Your password has been changed securely. You can now sign in.")
    window.setTimeout(() => {
      void supabase.auth.signOut({ scope: "local" }).finally(() => nav("/sign-in", { replace: true }))
    }, 1200)
  }

  return (
    <main className="auth-phone form-page deluxe-signin reset-password-page">
      <header className="signin-top">
        <Link className="back-link" to="/sign-in">← <span>Sign in</span></Link>
        <span>SECURE RECOVERY</span>
      </header>
      <section className="signin-intro">
        <Mark />
        <p className="eyebrow-auth">CREATE NEW PASSWORD</p>
        <h1>Choose something<br/><em>new.</em></h1>
        <p className="intro">Use a strong password you have not used for this account before.</p>
      </section>
      <section className="signin-form-card">
        <div className="signin-security-note"><span>⌾</span><p><b>Protected change</b><small>The recovery session is verified before your password is replaced.</small></p></div>
        <form onSubmit={submit} noValidate>
          <Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint="8+ characters with a number and symbol" />
          <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <button className="auth-primary" disabled={busy}>{busy ? "SAVING SECURELY…" : "SAVE NEW PASSWORD"}<b>→</b></button>
          {notice && <p className={`form-notice ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"}>{notice}</p>}
        </form>
      </section>
    </main>
  )
}

export function CreateAccount() {
  const nav = useNavigate()
  const [draft] = useState(readManualSignupDraft)
  const [first, setFirst] = useState(draft.first)
  const [last, setLast] = useState(draft.last)
  const [username, setUsername] = useState(draft.username)
  const [email, setEmail] = useState(draft.email)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [notice, setNotice] = useState("")
  const [noticeKind, setNoticeKind] = useState<"error" | "success">("error")
  const [busy, setBusy] = useState(false)
  const [verification, setVerification] = useState(false)
  const [resending, setResending] = useState(false)
  const resendPending = useRef(false)
  const [passwordMinimum, setPasswordMinimum] = useState(8)
  const [usernameRequired, setUsernameRequired] = useState(true)
  const [googleEnabled, setGoogleEnabled] = useState(true)
  const [settingsReady, setSettingsReady] = useState(false)
  const [settingsFailed, setSettingsFailed] = useState(false)
  const [settingsAttempt, setSettingsAttempt] = useState(0)
  const [step, setStep] = useState(draft.step)
  const [direction, setDirection] = useState("forward")
  const transition = useStepTransition()
  const submitting = useRef(false)
  const stepTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!verification) saveManualSignupDraft({ first, last, username, email, step })
  }, [first, last, username, email, step, verification])
  // Keep stable step identities even when a slow/realtime settings response
  // changes whether a username is required. Optional is not a removed step.
  const steps = ["name", "username", "email", "security"]
  const current = steps[Math.min(step, steps.length - 1)]
  const titles: Record<string, string> = { name: "What should we call you?", username: "Make it yours.", email: "Stay in the loop.", security: "Your own cozy space." }
  const move = (next: number) => {
    if (submitting.current) return
    transition.move(() => {
    setDirection(next < step ? "backward" : "forward")
    setNotice("")
    setStep(next)
    })
  }
  useEffect(() => {
    if (step > 0) stepTitle.current?.focus({ preventScroll: true })
  }, [step])
  useEffect(() => {
    const back = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "cozycraft-native-back" || verification || step === 0) return
      event.stopImmediatePropagation()
      if (!busy) move(step - 1)
    }
    window.addEventListener("message", back, true)
    return () => window.removeEventListener("message", back, true)
  }, [step, busy, verification])

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("account_settings")
        .eq("id", true)
        .maybeSingle()
      const settings = data?.account_settings as Record<string, unknown> | undefined
      if (!active) return
      if (error || !settings) throw new Error("Account settings unavailable")
      setPasswordMinimum(Math.max(8, Number(settings.password_minimum_length) || 8))
      setUsernameRequired(settings.username_required !== false)
      setGoogleEnabled(settings.google_auth_enabled !== false)
      setSettingsFailed(false)
      setSettingsReady(true)
    }
    const settingsFailure = () => {
      if (!active) return
      setSettingsReady(false)
      setSettingsFailed(true)
      setNotice("Account settings couldn’t load. Check your connection before creating your account.")
    }
    void loadSettings().catch(settingsFailure)
    const channel = supabase
      .channel("mobile-registration-settings")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "store_settings" },
        () => { void loadSettings().catch(settingsFailure) },
      )
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [settingsAttempt])

  const requirements = [
    password.length >= passwordMinimum,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const passwordScore = requirements.filter(Boolean).length
  const passwordStrong = requirements.every(Boolean)
  const passwordsMatch = Boolean(confirm) && password === confirm
  const strength = !password
    ? ""
    : passwordScore === requirements.length
      ? "Strong"
      : passwordScore >= 3
        ? "Fair"
        : "Weak"

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current || transition.locked.current) return
    if (!settingsReady) return
    setNotice("")
    setNoticeKind("error")
    if (current !== "security") {
      if (current === "name" && (!first.trim() || !last.trim())) return setNotice("Enter your first and last name to continue.")
      if (current === "username" && (usernameRequired || username.trim()) && !/^[A-Za-z0-9._-]{3,24}$/.test(username.trim())) return setNotice("Use 3–24 letters, numbers, dots, underscores, or hyphens.")
      if (current === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setNotice("Enter a valid email address.")
      move(step + 1)
      return
    }
    if (!first.trim() || !last.trim()) {
      setNotice("Enter your first and last name to continue.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setNotice("Enter a valid email address.")
      return
    }
    if (!agreed) {
      setNotice("Please agree to the Terms and Privacy Policy to continue.")
      return
    }
    if (usernameRequired && !/^[A-Za-z0-9._-]{3,24}$/.test(username.trim())) {
      setNotice("Username must be 3–24 characters using letters, numbers, dots, underscores, or hyphens.")
      return
    }
    if (!passwordStrong) {
      setNotice(`Use at least ${passwordMinimum} characters with uppercase and lowercase letters, a number, and a symbol.`)
      return
    }
    if (!passwordsMatch) {
      setNotice("Passwords do not match. Please try again.")
      return
    }
    setBusy(true)
    submitting.current = true
    try {
    try { localStore.setItem(MOBILE_POLICY_PENDING_KEY, MOBILE_POLICY_VERSION) } catch { /* Storage can be unavailable in private browsers. */ }
    const result = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: `${first.trim()} ${last.trim()}`.trim(),
          first_name: first.trim(),
          cozy_tour_pending_v1: true,
          last_name: last.trim(),
          username: username.trim(),
        },
        emailRedirectTo: mobileRedirectUrl(),
      },
    })
    const message = result.error?.message.toLowerCase() || ""
    const code = result.error?.code?.toLowerCase() || ""
    const duplicate =
      code === "user_already_exists" ||
      message.includes("already registered") ||
      message.includes("already exists") ||
      (Array.isArray(result.data.user?.identities) && result.data.user.identities.length === 0)
    if (result.error || duplicate) {
      try { localStore.removeItem(MOBILE_POLICY_PENDING_KEY) } catch { /* Optional persistence. */ }
      setNotice(duplicate
        ? "An account with this email already exists. Sign in instead."
        : result.error?.message || "Account creation failed.")
      return
    }
    clearManualSignupDraft()
    if (!result.data.session) {
      setPassword("")
      setConfirm("")
      setVerification(true)
      return
    }
    clearMobileCustomerCache()
    leaveGuestMode()
    await finishPendingPolicyAcceptance().catch((cause) => {
      console.warn("Policy acceptance will retry on the next session", cause)
    })
    nav("/shop")
    } catch {
      setNotice("We couldn’t finish connecting. Please try again; if you already received a confirmation email, use that link.")
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  if (verification) {
    return (
      <main className="auth-phone registration-verify signup-journey">
        <Link className="back-link" to="/sign-in">← Back to sign in</Link>
        <section>
          <CozyCompanion pose="signup-verify" />
          <p className="eyebrow-auth">CONFIRM YOUR EMAIL</p>
          <h1>One last step.</h1>
          <p>
            We sent a secure confirmation link to <b>{email.trim().toLowerCase()}</b>.
            Verify your email before signing in to CozyCraft.
          </p>
          <button className="auth-primary" onClick={() => nav("/sign-in")}>
            I confirmed my email <b>→</b>
          </button>
          <button
            className="registration-resend"
            disabled={resending}
            onClick={async () => {
              if (resendPending.current) return
              resendPending.current = true
              setResending(true)
              setNotice("")
              try {
              const { error } = await supabase.auth.resend({
                type: "signup",
                email: email.trim().toLowerCase(),
                options: { emailRedirectTo: mobileRedirectUrl() },
              })
              setResending(false)
              setNoticeKind(error ? "error" : "success")
              setNotice(error ? error.message : "A new confirmation email was sent.")
              } catch { setNoticeKind("error"); setNotice("Couldn’t send the email. Please try again.") }
              finally { resendPending.current = false; setResending(false) }
            }}
          >
            {resending ? "Sending…" : "Resend confirmation email"}
          </button>
          {notice && <p className={`form-notice ${noticeKind}`}>{notice}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="auth-phone form-page create deluxe-create signup-journey">
      <header className="create-top">
        {step === 0 ? <BackLink /> : <button type="button" className="back-link" disabled={busy || transition.transitioning} onClick={() => move(step - 1)}>← <span>Back</span></button>}
        <span aria-live="polite">Step {Math.min(step + 1, steps.length)} of {steps.length}</span>
      </header>
      <div className="signup-progress" aria-hidden="true">{steps.map((value, index) => <i key={value} className={index <= step ? "active" : ""} />)}</div>
      <section key={current} className={`create-intro signup-slide ${direction}`}>
        <CozyCompanion pose={`signup-${current}` as CompanionPose} />
        <h1 ref={stepTitle} tabIndex={-1}>{titles[current]}</h1>
        <p className="intro">{current === "name" ? "A little introduction. A warm welcome." : current === "username" ? "Choose a name that feels like you." : current === "email" ? "For your account and order updates." : "A strong password keeps it yours."}</p>
      </section>
      <section className="create-form-card">
        {googleEnabled && step === 0 && (
          <>
            <button
              type="button"
              className="google create-google"
              disabled={busy || !settingsReady}
              onClick={async () => {
                if (submitting.current) return
                submitting.current = true
                setBusy(true)
                try {
                clearMobileCustomerCache()
                leaveGuestMode()
                setNotice("")
                try { localStore.setItem(MOBILE_POLICY_PENDING_KEY, MOBILE_POLICY_VERSION) } catch { /* Optional persistence. */ }
                const { data, error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: googleOAuthOptions(mobileRedirectUrl()),
                })
                if (error) setNotice(error.message)
                else if (data.url && window.parent !== window) {
                  window.parent.postMessage({ type: "cozycraft-open-oauth", url: data.url }, "*")
                }
                } catch { setNotice("Couldn’t connect to Google. Please try again.") }
                finally { submitting.current = false; setBusy(false) }
              }}
            >
              <img src={googleMark} alt="" aria-hidden="true" />
              Continue with Google
            </button>
            <div className="or"><span />OR<span /></div>
          </>
        )}
        <form onSubmit={submit} onKeyDown={(event) => { if (event.key === "Enter" && event.repeat) event.preventDefault() }} noValidate>
          {current === "name" && <div className="registration-name-grid">
            <Field label="First name" value={first} onChange={setFirst} autoComplete="given-name" />
            <Field label="Last name" value={last} onChange={setLast} autoComplete="family-name" />
          </div>}
          {current === "username" && (
            <Field
              label="Username"
              value={username}
              onChange={(value) => setUsername(value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24))}
              autoComplete="username"
              hint={`${usernameRequired ? "" : "Optional. "}3–24 characters; letters, numbers, dots, underscores, or hyphens`}
            />
          )}
          {current === "email" && <Field
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />}
          {current === "security" && <><Field
            label="Create a password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={settingsReady ? `At least ${passwordMinimum} characters` : "Checking password requirements…"}
          />
          <div className="password-strength" aria-live="polite">
            <div>
              {requirements.map((passed, level) => (
                <i
                  className={passed ? "active" : ""}
                  key={level}
                />
              ))}
            </div>
            <span>{strength || "Secure password"}</span>
          </div>
          <p className="password-guidance">
            Use uppercase and lowercase letters, a number, and a symbol.
          </p>
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            hint={confirm ? (passwordsMatch ? "Passwords match" : "Passwords do not match") : undefined}
          />
          <label className="agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I agree to CozyCraft’s{" "}
              <Link to="/terms" onClick={(event) => event.stopPropagation()}>Terms</Link> and{" "}
              <Link to="/privacy-policy" onClick={(event) => event.stopPropagation()}>Privacy Policy</Link>.
            </span>
          </label></>}
          {settingsFailed && <button type="button" className="registration-resend" onClick={() => {
            setSettingsFailed(false)
            setNotice("")
            setSettingsAttempt((value) => value + 1)
          }}>Reload account settings</button>}
          <button className="auth-primary" type="submit" disabled={busy || transition.transitioning || !settingsReady}>
            {!settingsReady && !settingsFailed ? "Loading settings…" : busy ? "Creating your account…" : current === "security" ? "Create my account" : "Continue"} <b>→</b>
          </button>
          {notice && (
            <p className={`form-notice ${noticeKind}`} role="alert">
              {notice}
            </p>
          )}
        </form>
        <p className="switch-auth">
          Already a member? <Link to="/sign-in">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
function Missing() {
  return (
    <main className="auth-phone welcome">
      <section>
        <Mark />
        <p className="eyebrow-auth">PAGE NOT FOUND</p>
        <h1>
          This room is
          <br />
          <em>still empty.</em>
        </h1>
        <p className="intro">Let's take you somewhere familiar.</p>
        <Link to="/welcome" className="auth-primary">
          BACK TO WELCOME <b>→</b>
        </Link>
      </section>
    </main>
  )
}
export function CustomerHomeRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const [launching, setLaunching] = useState(() => location.state?.sofaLaunch === true)
  const [handoff] = useState(() => launching || hasLaunchHandoff())
  const [homeReady, setHomeReady] = useState(false)
  const [homeBlocked, setHomeBlocked] = useState(false)
  const [pace] = useState(readLaunchPace)
  const finishLaunch = () => {
    setLaunching(false)
    // Same route and same component: discard the one-shot history flag without
    // replacing the prepared storefront, its subscriptions, or its UI state.
    void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null, preventScrollReset: true })
  }
  return <div className="launch-home-stage">
    <div className="launch-home-underlay" inert={launching} aria-hidden={launching || undefined}>
      <CustomerSecurityGate handoff={handoff} onBlocked={() => setHomeBlocked(true)}>
        <Suspense fallback={<CozyLaunchScreen handoff={handoff} />}>
          <Storefront launchHandoff={handoff} onReady={() => setHomeReady(true)} initialSupport={location.state?.openSupport === true} />
        </Suspense>
      </CustomerSecurityGate>
    </div>
    {launching && <SofaLaunchSequence homeReady={homeReady || homeBlocked} onComplete={finishLaunch} pace={pace} />}
  </div>
}
export const router = createHashRouter([
  { path: "/", Component: Splash },
  { path: "/welcome", Component: Welcome },
  { path: "/sign-in", Component: SignIn },
  { path: "/reset-password", Component: ResetPassword },
  { path: "/create-account", Component: CreateAccount },
  { path: "/terms", Component: () => <LegalDocument kind="terms" /> },
  { path: "/privacy-policy", Component: () => <LegalDocument kind="privacy" /> },
  { path: "/about", Component: () => <ContentDocument kind="about" /> },
  { path: "/contact", Component: () => <ContentDocument kind="contact" /> },
  { path: "/shop", Component: CustomerHomeRoute },
  { path: "*", Component: Missing },
])

import { useEffect, useRef } from "react"
import { countdownLabel, isSixDigitOtp, maskPhilippineMobile, normalizeOtp } from "./phone-verification"
import type { PhoneVerificationController } from "./usePhoneVerification"
import SecurityDialog from "./SecurityDialog"
import "./profile-security.css"

export default function PhoneVerificationField({ phone, savedPhone, verifiedAt, editing, disabled, onChange, verification: flow }: {
  phone: string; savedPhone: string; verifiedAt: string | null; editing: boolean; disabled: boolean
  onChange: (value: string) => void; verification: PhoneVerificationController
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (flow.open && flow.challenge && !flow.success && !flow.busy) input.current?.focus()
  }, [flow.open, flow.challenge?.id])
  const replacing = Boolean(verifiedAt && flow.changing)
  return <>
    <div className="mobile-phone-field profile-field-wide">
      <div className="mobile-phone-label">
        <label htmlFor="profile-mobile-number">Mobile number</label>
        <span className={`mobile-phone-badge ${flow.verified ? "is-verified" : ""}`}>
          {flow.verified ? "✓ Verified" : phone ? "Verification required" : "Not added"}
        </span>
      </div>
      <div className="mobile-phone-control">
        <input id="profile-mobile-number" type="tel" inputMode="tel" autoComplete="tel" maxLength={24}
          value={phone} onChange={(event) => onChange(event.target.value)} placeholder="0917 123 4567"
          disabled={!editing || disabled || Boolean(flow.busy) || Boolean(verifiedAt && !flow.changing)}
          aria-describedby="profile-phone-help" />
        {editing && verifiedAt && !flow.changing && <button type="button" className="mobile-phone-change" disabled={disabled || Boolean(flow.busy)} onClick={flow.changeNumber}>Change number</button>}
        {editing && !flow.verified && (!verifiedAt || flow.changing) && <button type="button" className="mobile-phone-verify"
          onClick={flow.start} disabled={disabled || Boolean(flow.busy) || !flow.validPhone}>
          {flow.busy === "sending" ? "Sending…" : "Verify number"}
        </button>}
      </div>
      <p id="profile-phone-help">{replacing
        ? `Your current number (${maskPhilippineMobile(savedPhone)}) stays active until your new number is verified.`
        : flow.verified ? "Verified for account security and delivery updates."
          : "We’ll text you a six-digit code. Your number is saved only after verification."}</p>
      {replacing && <button type="button" className="mobile-security-text" disabled={disabled || Boolean(flow.busy)} onClick={flow.keepCurrent}>Keep current number</button>}
    </div>
    {flow.open && <SecurityDialog titleId="profile-phone-title" busy={Boolean(flow.busy)} close={flow.close}>
      <header className="mobile-security-heading">
        <span className="mobile-security-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 8 3v6c0 4-4.5 7.5-8 9-3.5-1.5-8-5-8-9V6l8-3Z" stroke="currentColor" strokeWidth="1.7"/><path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
        <div><p>SECURE VERIFICATION</p><h2 id="profile-phone-title">{flow.success ? "Number verified." : replacing ? "Verify your new number." : "Confirm your number."}</h2></div>
        <button type="button" className="mobile-security-close" aria-label="Close phone verification" disabled={Boolean(flow.busy)} onClick={flow.close}>×</button>
      </header>
      {flow.success ? <div className="mobile-security-body mobile-phone-success">
        <span className="mobile-phone-success-check" aria-hidden="true">✓</span>
        <h3>You’re all set.</h3>
        <p><strong>{maskPhilippineMobile(flow.success.phone)}</strong> is verified and securely saved to your CozyCraft account.</p>
        <p className="mobile-security-note">This update is synced with your website profile too.</p>
        <button type="button" className="mobile-security-primary" onClick={flow.close}>Done</button>
      </div> : <form className="mobile-security-body" onSubmit={(event) => { event.preventDefault(); void flow.verify() }} aria-busy={Boolean(flow.busy)}>
        {flow.challenge ? <>
          <p>Enter the six-digit code sent to <strong>{flow.challenge.maskedPhone}</strong>.</p>
          {replacing && <p className="mobile-security-note">Your existing number stays registered until this code is confirmed.</p>}
          <label className="mobile-otp-label" htmlFor="profile-phone-otp">Verification code</label>
          <input ref={input} id="profile-phone-otp" className="mobile-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={flow.code}
            disabled={Boolean(flow.busy) || flow.locked || flow.expiresRemaining <= 0}
            onChange={(event) => flow.setCode(normalizeOtp(event.target.value))} aria-describedby="profile-code-expiry" />
          <div className="mobile-otp-timing">
            <span id="profile-code-expiry">{flow.expiresRemaining > 0 ? `Expires in ${countdownLabel(flow.expiresRemaining)}` : "Code expired"}</span>
            <button type="button" className="mobile-security-text" onClick={() => void flow.resend()}
              disabled={Boolean(flow.busy) || flow.resendRemaining > 0}>
              {flow.busy === "sending" ? "Sending…" : flow.resendRemaining > 0 ? `Resend in ${flow.resendRemaining}s` : "Resend code"}
            </button>
          </div>
          {flow.expiresRemaining <= 0 && <p className="mobile-security-note">Request a new code to continue. Your saved number has not changed.</p>}
        </> : <div className="mobile-phone-sending" role="status">
          {flow.busy === "sending" ? <><span className="mobile-security-spinner" aria-hidden="true"/><p>Sending your verification code…</p></> :
            <button type="button" className="mobile-security-secondary" onClick={() => void flow.resend()} disabled={flow.resendRemaining > 0}>
              {flow.resendRemaining > 0 ? `Try again in ${flow.resendRemaining}s` : "Try sending again"}
            </button>}
        </div>}
        {flow.error && <p className="mobile-security-error" role="alert">{flow.error}</p>}
        <button type="submit" className="mobile-security-primary"
          disabled={!flow.challenge || !isSixDigitOtp(flow.code) || flow.expiresRemaining <= 0 || flow.locked || Boolean(flow.busy)}>
          {flow.busy === "verifying" ? "Checking code…" : replacing ? "Verify and replace number" : "Verify and save number"}
        </button>
        <p className="mobile-security-footnote">Never share your code. CozyCraft will never ask you to tell it to another person.</p>
      </form>}
    </SecurityDialog>}
  </>
}

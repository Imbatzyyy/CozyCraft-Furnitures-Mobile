import { useEffect, useRef, useState } from "react"
import {
  confirmPhoneVerification, isVerifiedPhone, normalizePhilippineMobile,
  PhoneVerificationError, requestPhoneVerification, secondsUntil,
  type PhoneChallenge, type VerifiedPhone,
} from "./phone-verification"

type Options = {
  userId: string
  savedPhone: string
  phoneVerifiedAt: string | null
  draftPhone: string
  onDraftChange: (phone: string) => void
  onVerified: (phone: VerifiedPhone) => void
}

export function usePhoneVerification(options: Options) {
  const latest = useRef(options)
  latest.current = options
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null)
  const [success, setSuccess] = useState<VerifiedPhone | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<"sending" | "verifying" | null>(null)
  const [locked, setLocked] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const flight = useRef<AbortController | null>(null)
  const normalizedDraft = normalizePhilippineMobile(options.draftPhone)
  const verified = isVerifiedPhone(options.draftPhone, options.savedPhone, options.phoneVerifiedAt)

  const reset = () => {
    flight.current?.abort()
    flight.current = null
    setBusy(null)
    setOpen(false)
    setChanging(false)
    setChallenge(null)
    setSuccess(null)
    setCode("")
    setError("")
    setLocked(false)
  }

  useEffect(() => {
    reset()
    setResendAt(0)
    return () => { flight.current?.abort(); flight.current = null }
  }, [options.userId])

  useEffect(() => {
    if (challenge && challenge.phone !== normalizedDraft) {
      flight.current?.abort()
      flight.current = null
      setBusy(null)
      setOpen(false)
      setChallenge(null)
      setCode("")
      setError("")
      setLocked(false)
    }
  }, [normalizedDraft, challenge])

  useEffect(() => {
    if (!open && resendAt <= Date.now()) return
    const tick = () => setNow(Date.now())
    const nativeResume = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === "cozycraft-native-app-active") tick()
    }
    const timer = window.setInterval(tick, 1000)
    window.addEventListener("focus", tick)
    document.addEventListener("visibilitychange", tick)
    window.addEventListener("message", nativeResume)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", tick)
      document.removeEventListener("visibilitychange", tick)
      window.removeEventListener("message", nativeResume)
    }
  }, [open, resendAt, now >= resendAt])

  useEffect(() => {
    if (open && !busy && challenge && verified && options.phoneVerifiedAt && !success) {
      setCode("")
      setError("")
      setChanging(false)
      setSuccess({ phone: options.savedPhone, phoneVerifiedAt: options.phoneVerifiedAt })
    }
  }, [open, busy, challenge, verified, options.savedPhone, options.phoneVerifiedAt, success])

  const showError = (cause: unknown) => {
    const receivedAt = Date.now()
    setNow(receivedAt)
    setError(cause instanceof Error ? cause.message : "Phone verification could not be completed. Please try again.")
    if (cause instanceof PhoneVerificationError) {
      if (cause.retryAfter > 0) setResendAt(receivedAt + cause.retryAfter * 1000)
      if (cause.attemptsRemaining === 0) setLocked(true)
    }
  }
  const complete = (value: VerifiedPhone) => {
    setSuccess(value)
    setCode("")
    setError("")
    setChanging(false)
    latest.current.onDraftChange(value.phone)
    latest.current.onVerified(value)
  }

  const send = async () => {
    if (flight.current) return
    setOpen(true)
    setNow(Date.now())
    if (Date.now() < resendAt) return
    if (!options.userId) { setError("Please sign in before verifying your number."); return }
    const controller = new AbortController()
    flight.current = controller
    setBusy("sending")
    setSuccess(null)
    setError("")
    try {
      const result = await requestPhoneVerification(options.draftPhone, controller.signal)
      if (controller.signal.aborted) return
      setNow(Date.now())
      if (result.kind === "verified") complete(result.verified)
      else {
        setChallenge(result.challenge)
        setResendAt(result.challenge.resendAvailableAt)
        setCode("")
        setLocked(false)
      }
    } catch (cause) {
      if (!controller.signal.aborted) showError(cause)
    } finally {
      if (flight.current === controller) { flight.current = null; setBusy(null) }
    }
  }

  const start = () => {
    setNow(Date.now())
    if (challenge && challenge.phone === normalizedDraft) { setOpen(true); return }
    void send()
  }
  const verify = async () => {
    if (flight.current || !challenge || locked) return
    const controller = new AbortController()
    flight.current = controller
    setBusy("verifying")
    setError("")
    try {
      const result = await confirmPhoneVerification(challenge, code, controller.signal)
      if (!controller.signal.aborted) complete(result)
    } catch (cause) {
      if (!controller.signal.aborted) showError(cause)
    } finally {
      if (flight.current === controller) { flight.current = null; setBusy(null) }
    }
  }

  return {
    open, changing, challenge, success, code, error, busy, locked, verified,
    validPhone: Boolean(normalizedDraft),
    resendRemaining: secondsUntil(resendAt, now),
    expiresRemaining: challenge ? secondsUntil(challenge.expiresAt, now) : 0,
    setCode: (value: string) => { setCode(value); setError("") },
    start, resend: send, verify, reset,
    close: () => {
      if (flight.current) return
      setOpen(false)
      setCode("")
      setError("")
      if (success) { setSuccess(null); setChallenge(null) }
    },
    changeNumber: () => { reset(); setChanging(true); options.onDraftChange("") },
    keepCurrent: () => { reset(); options.onDraftChange(options.savedPhone) },
  }
}

export type PhoneVerificationController = ReturnType<typeof usePhoneVerification>

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { supabase } from "../lib/supabase"
import CozyCompanion, { type CompanionPose } from "./CozyCompanion"
import "./welcome-tour.css"

const stops: { target: string; title: string; copy: string; pose: CompanionPose }[] = [
  { target: "shop", title: "Discover your cozy.", copy: "Find something that feels like home.", pose: "tour-guide" },
  { target: "saved", title: "Keep your favorites.", copy: "Love a piece? Save it for later.", pose: "heart" },
  { target: "bag", title: "Your shopping bag.", copy: "Your chosen pieces come together here.", pose: "tour-bag" },
  { target: "account", title: "Your own space.", copy: "Your orders, rewards, and details—all together.", pose: "tour-account" },
]
const memoryDone = new Set<string>()
function doneHere(id: string) {
  try { return memoryDone.has(id) || localStorage.getItem(`cozy-tour-v1:${id}`) === "done" } catch { return memoryDone.has(id) }
}
export default function WelcomeTour({ userId, blocked, newGoogleAccount = false, onResolved }: { userId: string; blocked: boolean; newGoogleAccount?: boolean; onResolved?: (pending: boolean) => void }) {
  const [eligible, setEligible] = useState(false)
  const [step, setStep] = useState(-1)
  const [replay, setReplay] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [retry, setRetry] = useState(0)
  const dialog = useRef<HTMLElement>(null)
  const finishRef = useRef<() => void>(() => {})
  const resolvedRef = useRef(onResolved)
  const replaying = useRef(false)
  const advancing = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const finished = useRef(false)
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])
  resolvedRef.current = onResolved
  const open = Boolean(userId) && (eligible || replay) && !blocked
  useEffect(() => {
    let active = true
    // A refresh must not reset an in-progress tour or consume its handoff.
    if (!userId) return
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return
      if (replaying.current) return
      if (error || !data.user) throw new Error("Welcome preferences unavailable")
      if (data.user.id !== userId) { resolvedRef.current?.(false); return }
      const metadata = data.user.user_metadata || {}
      if (doneHere(userId)) {
        resolvedRef.current?.(false)
        if (metadata.cozy_tour_completed_v1 !== true) void supabase.auth.updateUser({ data: { cozy_tour_completed_v1: true, cozy_tour_pending_v1: false } }).catch(() => {})
        return
      }
      const pending = metadata.cozy_tour_completed_v1 !== true && (metadata.cozy_tour_pending_v1 === true || newGoogleAccount)
      setEligible(pending)
      resolvedRef.current?.(pending)
    }).catch(() => {
      if (!active) return
      if (replaying.current) return
      // Verified onboarding status is sufficient to offer the tour even if
      // the additional metadata request is temporarily unavailable.
      const pending = newGoogleAccount && !doneHere(userId)
      setEligible(pending)
      resolvedRef.current?.(pending)
    })
    return () => { active = false }
  }, [userId, newGoogleAccount, retry])
  useEffect(() => {
    const online = () => setRetry((value) => value + 1)
    window.addEventListener("online", online)
    return () => window.removeEventListener("online", online)
  }, [])
  useEffect(() => {
    const replayTour = () => { if (replaying.current) return; finished.current = false; replaying.current = true; setStep(-1); setReplay(true); resolvedRef.current?.(true) }
    window.addEventListener("cozycraft-replay-tour", replayTour)
    return () => window.removeEventListener("cozycraft-replay-tour", replayTour)
  }, [])
  const finish = () => {
    if (finished.current) return
    finished.current = true
    replaying.current = false
    memoryDone.add(userId)
    try { localStorage.setItem(`cozy-tour-v1:${userId}`, "done") } catch { /* Session memory still prevents repeats. */ }
    setEligible(false); setReplay(false)
    resolvedRef.current?.(false)
    // This is a UI preference, never an authorization or reward claim.
    void supabase.auth.getUser().then(async ({ data }) => {
      if (data.user?.id === userId) await supabase.auth.updateUser({ data: { cozy_tour_completed_v1: true, cozy_tour_pending_v1: false } })
    }).catch(() => { /* Offline completion is retained on this device. */ })
  }
  finishRef.current = finish
  const advance = (delta: number) => {
    if (advancing.current || finished.current) return
    advancing.current = true
    setTransitioning(true)
    if (delta > 0 && step === stops.length - 1) finish()
    else setStep((current) => Math.max(-1, Math.min(stops.length - 1, current + delta)))
    advanceTimer.current = setTimeout(() => { advancing.current = false; setTransitioning(false) }, 280)
  }
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const root = document.getElementById("root")
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    document.documentElement.classList.add("cozy-tour-open")
    dialog.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finishRef.current(); return }
      if (e.key !== "Tab") return
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    const back = (e: MessageEvent) => { if (e.source === window.parent && e.data?.type === "cozycraft-native-back") { e.stopImmediatePropagation(); finishRef.current() } }
    document.addEventListener("keydown", key, true); window.addEventListener("message", back, true)
    return () => { document.documentElement.classList.remove("cozy-tour-open"); if (root) root.inert = wasInert; document.removeEventListener("keydown", key, true); window.removeEventListener("message", back, true); if (previous?.isConnected) previous.focus() }
  }, [open])
  useEffect(() => {
    if (!open) return
    const measure = () => {
      const target = step >= 0 ? document.querySelector<HTMLElement>(`button[data-nav="${stops[step].target}"]`) : null
      const bounds = target?.getBoundingClientRect()
      const next = bounds && bounds.width && bounds.top >= 0 && bounds.bottom <= window.innerHeight ? bounds : null
      setRect((current) => current?.left === next?.left && current?.top === next?.top && current?.width === next?.width && current?.height === next?.height ? current : next)
    }
    let frame = 0
    const scheduleMeasure = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => { frame = 0; measure() })
    }
    measure()
    window.addEventListener("resize", scheduleMeasure); window.visualViewport?.addEventListener("resize", scheduleMeasure)
    document.addEventListener("scroll", scheduleMeasure, true)
    dialog.current?.focus({ preventScroll: true })
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", scheduleMeasure); window.visualViewport?.removeEventListener("resize", scheduleMeasure); document.removeEventListener("scroll", scheduleMeasure, true) }
  }, [open, step])
  if (!open) return null
  const stop = stops[step]
  return createPortal(<div className="welcome-tour">
    {rect ? <div className="welcome-tour-highlight" aria-hidden="true" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="welcome-tour-shade" aria-hidden="true" />}
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} className="welcome-tour-card">
      <button className="tour-skip" onClick={finish}>Skip tour</button>
      <div key={step} className="tour-content">
        <CozyCompanion pose={stop?.pose || "tour-guide"} />
        <small>{step < 0 ? "A LITTLE HELLO" : `${step + 1} OF ${stops.length}`}</small>
        <h2 id="tour-title">{stop?.title || "Welcome home."}</h2>
        <p>{stop?.copy || "Want a quick look around?"}</p>
      </div>
      <div className="tour-actions">
        {step >= 0 && <button disabled={transitioning} onClick={() => advance(-1)}>Back</button>}
        <button className="tour-next" disabled={transitioning} onClick={() => advance(1)}>{step < 0 ? "Show me around" : step === stops.length - 1 ? "Finish" : "Next"}<span aria-hidden="true"> →</span></button>
      </div>
    </section>
  </div>, document.body)
}

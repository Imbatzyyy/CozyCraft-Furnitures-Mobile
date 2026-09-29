import { useEffect, useRef, useState } from "react"
import CozyLaunchScreen from "./CozyLaunchScreen"
import { markLaunchHandoff, markLaunchSeen, type LaunchPace } from "./launch-handoff"

export const SOFA_ANIMATION_DURATION_MS = 5000
export const SOFA_FINISH_HOLD_MS = 1000
export const SOFA_LAUNCH_DURATION_MS = SOFA_ANIMATION_DURATION_MS + SOFA_FINISH_HOLD_MS
export const SOFA_TRANSITION_DURATION_MS = 800

// Returning customers see the same drawing, compressed so it never delays shopping.
export const QUICK_SOFA_ANIMATION_DURATION_MS = 1100
export const QUICK_SOFA_FINISH_HOLD_MS = 150
export const QUICK_SOFA_LAUNCH_DURATION_MS = QUICK_SOFA_ANIMATION_DURATION_MS + QUICK_SOFA_FINISH_HOLD_MS
export const QUICK_SOFA_TRANSITION_DURATION_MS = 420

export function sofaTimings(pace: LaunchPace) {
  return pace === "quick"
    ? { launch: QUICK_SOFA_LAUNCH_DURATION_MS, transition: QUICK_SOFA_TRANSITION_DURATION_MS }
    : { launch: SOFA_LAUNCH_DURATION_MS, transition: SOFA_TRANSITION_DURATION_MS }
}

/** Run one complete sofa drawing, hold the finished pose, then continue. */
export default function SofaLaunchSequence({ onComplete, homeReady = true, pace = "full" }: { onComplete: () => void; homeReady?: boolean; pace?: LaunchPace }) {
  const complete = useRef(onComplete)
  complete.current = onComplete
  const [timings] = useState(() => sofaTimings(pace))
  const exitingRef = useRef(false)
  const [exiting, setExiting] = useState(false)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setFinished(true), timings.launch)
    return () => window.clearTimeout(timer)
  }, [timings])
  useEffect(() => {
    if (!finished || !homeReady || exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
  }, [finished, homeReady])
  useEffect(() => {
    if (!exiting) return
    const timer = window.setTimeout(() => { markLaunchHandoff(); markLaunchSeen(); complete.current() }, timings.transition)
    return () => window.clearTimeout(timer)
  }, [exiting, timings])
  return <CozyLaunchScreen animated exiting={exiting} pace={pace} />
}

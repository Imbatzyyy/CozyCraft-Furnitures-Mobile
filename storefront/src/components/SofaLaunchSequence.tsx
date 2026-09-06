import { useEffect, useRef, useState } from "react"
import CozyLaunchScreen from "./CozyLaunchScreen"
import { markLaunchHandoff } from "./launch-handoff"

export const SOFA_ANIMATION_DURATION_MS = 5000
export const SOFA_FINISH_HOLD_MS = 1000
export const SOFA_LAUNCH_DURATION_MS = SOFA_ANIMATION_DURATION_MS + SOFA_FINISH_HOLD_MS
export const SOFA_TRANSITION_DURATION_MS = 800

/** Run one complete sofa drawing, hold the finished pose, then continue. */
export default function SofaLaunchSequence({ onComplete, homeReady = true }: { onComplete: () => void; homeReady?: boolean }) {
  const complete = useRef(onComplete)
  complete.current = onComplete
  const exitingRef = useRef(false)
  const [exiting, setExiting] = useState(false)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setFinished(true), SOFA_LAUNCH_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!finished || !homeReady || exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
  }, [finished, homeReady])
  useEffect(() => {
    if (!exiting) return
    const timer = window.setTimeout(() => { markLaunchHandoff(); complete.current() }, SOFA_TRANSITION_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [exiting])
  return <CozyLaunchScreen animated exiting={exiting} />
}

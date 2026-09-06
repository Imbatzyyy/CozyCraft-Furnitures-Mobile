import { useEffect, useRef, useState } from "react"
import CozyLaunchScreen from "./CozyLaunchScreen"
import { markLaunchHandoff } from "./launch-handoff"

export const SOFA_ANIMATION_DURATION_MS = 5000
export const SOFA_FINISH_HOLD_MS = 2000
export const SOFA_LAUNCH_DURATION_MS = SOFA_ANIMATION_DURATION_MS + SOFA_FINISH_HOLD_MS
export const SOFA_TRANSITION_DURATION_MS = 800

/** Run one complete sofa drawing, hold the finished pose, then continue. */
export default function SofaLaunchSequence({ onComplete }: { onComplete: () => void }) {
  const complete = useRef(onComplete)
  complete.current = onComplete
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const transitionTimer = window.setTimeout(() => setExiting(true), SOFA_LAUNCH_DURATION_MS)
    const completeTimer = window.setTimeout(() => { markLaunchHandoff(); complete.current() }, SOFA_LAUNCH_DURATION_MS + SOFA_TRANSITION_DURATION_MS)
    return () => {
      window.clearTimeout(transitionTimer)
      window.clearTimeout(completeTimer)
    }
  }, [])
  return <CozyLaunchScreen animated exiting={exiting} />
}

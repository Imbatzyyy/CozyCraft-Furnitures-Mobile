import { useEffect, useRef } from "react"
import CozyLaunchScreen from "./CozyLaunchScreen"

export const SOFA_ANIMATION_DURATION_MS = 5000
export const SOFA_FINISH_HOLD_MS = 2000
export const SOFA_LAUNCH_DURATION_MS = SOFA_ANIMATION_DURATION_MS + SOFA_FINISH_HOLD_MS

/** Run one complete sofa drawing, hold the finished pose, then continue. */
export default function SofaLaunchSequence({ onComplete }: { onComplete: () => void }) {
  const complete = useRef(onComplete)
  complete.current = onComplete
  useEffect(() => {
    const timer = window.setTimeout(() => complete.current(), SOFA_LAUNCH_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return <CozyLaunchScreen animated />
}

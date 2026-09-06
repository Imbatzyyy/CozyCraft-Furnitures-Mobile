import { useEffect, useRef } from "react"
import CozyLaunchScreen from "./CozyLaunchScreen"

export const SOFA_LAUNCH_DURATION_MS = 5000

/** Only the cold-launch route holds the screen; ordinary refreshes never wait. */
export default function SofaLaunchSequence({ onComplete }: { onComplete: () => void }) {
  const complete = useRef(onComplete)
  complete.current = onComplete
  useEffect(() => {
    const timer = window.setTimeout(() => complete.current(), SOFA_LAUNCH_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return <CozyLaunchScreen />
}

import { useEffect, useRef, useState } from "react"

// Lock synchronously, before React paints the disabled button. This handles
// queued taps/Enter events on slower WebViews without advancing twice.
export default function useStepTransition() {
  const locked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [transitioning, setTransitioning] = useState(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  const move = (action: () => void) => {
    if (locked.current) return false
    locked.current = true
    setTransitioning(true)
    action()
    timer.current = setTimeout(() => { locked.current = false; setTransitioning(false) }, 240)
    return true
  }
  return { transitioning, move, locked }
}

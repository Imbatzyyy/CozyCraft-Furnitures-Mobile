import { useEffect, useRef } from "react"

// Decorative clocks/carousels do not need to wake the app while backgrounded.
// Resume starts one fresh interval, never a burst of missed ticks.
export default function useVisibleInterval(callback: () => void, delay: number | null, refreshOnResume = false) {
  const current = useRef(callback)
  useEffect(() => { current.current = callback }, [callback])
  useEffect(() => {
    if (delay === null) return
    let timer: ReturnType<typeof setInterval> | undefined
    const sync = () => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      if (document.hidden) return
      if (refreshOnResume) current.current()
      timer = setInterval(() => current.current(), delay)
    }
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => { if (timer !== undefined) clearInterval(timer); document.removeEventListener("visibilitychange", sync) }
  }, [delay, refreshOnResume])
}

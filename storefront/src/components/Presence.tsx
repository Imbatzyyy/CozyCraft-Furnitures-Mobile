import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { motionEconomy, prefersReducedMotion } from "../lib/motion"

export const PRESENCE_EXIT_MS = 200
export const PRESENCE_ECONOMY_EXIT_MS = 120

type Phase = "hidden" | "shown" | "leaving"

/**
 * Keeps an overlay mounted briefly after it closes so it can animate out.
 *
 * While leaving, the last rendered element is replayed unchanged, so React
 * leaves the page (its scroll position and state) exactly as the customer saw
 * it. The leaving root is marked inert and `is-leaving`; CSS owns the motion.
 * Opening again always mounts a fresh page rather than reviving a closing one.
 */
export default function Presence({ show, selector, children }: { show: boolean; selector: string; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(show ? "shown" : "hidden")
  const [generation, setGeneration] = useState(0)
  const last = useRef<ReactNode>(null)
  if (show) last.current = children

  useLayoutEffect(() => {
    if (show) {
      if (phase === "shown") return
      if (phase === "leaving") setGeneration(value => value + 1)
      setPhase("shown")
      return
    }
    if (phase !== "shown") return
    if (prefersReducedMotion() || document.hidden) {
      setPhase("hidden")
      return
    }
    const nodes = document.querySelectorAll<HTMLElement>(selector)
    const node = nodes[nodes.length - 1] || null
    if (!node) {
      setPhase("hidden")
      return
    }
    node.classList.add("is-leaving")
    node.setAttribute("inert", "")
    node.setAttribute("aria-hidden", "true")
    setPhase("leaving")
  }, [show, phase, selector])

  useLayoutEffect(() => {
    if (phase !== "leaving") return
    const timer = window.setTimeout(() => setPhase("hidden"), motionEconomy() ? PRESENCE_ECONOMY_EXIT_MS : PRESENCE_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  useLayoutEffect(() => {
    if (phase === "hidden") last.current = null
  }, [phase])

  // Reopening mid-exit switches the key in this same render, so the closing
  // instance is never reused with the new page's props.
  const key = show && phase === "leaving" ? generation + 1 : generation
  const content = show ? children : phase === "hidden" ? null : last.current
  return <Fragment key={key}>{content}</Fragment>
}

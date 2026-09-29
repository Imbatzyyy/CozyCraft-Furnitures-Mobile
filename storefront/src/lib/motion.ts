/** Shared motion preferences for script-driven animation. CSS handles its own. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function motionEconomy() {
  return typeof document !== "undefined" && document.documentElement.dataset.cozyMotion === "economy"
}

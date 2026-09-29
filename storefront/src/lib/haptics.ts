export type HapticKind = "light" | "medium" | "selection" | "success" | "warning"

/**
 * Ask the native shell for a short tactile confirmation. The storefront runs
 * inside the app's iframe; outside it (browser QA) this is a no-op.
 */
export function haptic(kind: HapticKind = "light") {
  if (typeof window === "undefined" || window.parent === window) return
  try { window.parent.postMessage({ type: "cozycraft-haptic", kind }, "*") } catch { /* optional enhancement */ }
}

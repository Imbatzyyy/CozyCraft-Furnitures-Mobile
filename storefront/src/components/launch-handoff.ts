import { localStore, sessionStore } from "../lib/browser-storage"
export const LAUNCH_HANDOFF_KEY = "cozycraft-launch-handoff"
export const LAUNCH_SEEN_KEY = "cozycraft-launch-seen"

/** The full sofa drawing is a first-launch moment; later launches get a short cut. */
export type LaunchPace = "full" | "quick"

export function markLaunchHandoff() {
  try { sessionStore.setItem(LAUNCH_HANDOFF_KEY, "1") } catch { /* private browsing may deny storage */ }
}

export function hasLaunchHandoff() {
  try { return sessionStore.getItem(LAUNCH_HANDOFF_KEY) === "1" } catch { return false }
}

export function clearLaunchHandoff() {
  try { sessionStore.removeItem(LAUNCH_HANDOFF_KEY) } catch { /* private browsing may deny storage */ }
}

export function readLaunchPace(): LaunchPace {
  try { return localStore.getItem(LAUNCH_SEEN_KEY) === "1" ? "quick" : "full" } catch { return "full" }
}

export function markLaunchSeen() {
  try { localStore.setItem(LAUNCH_SEEN_KEY, "1") } catch { /* the next launch simply plays in full again */ }
}

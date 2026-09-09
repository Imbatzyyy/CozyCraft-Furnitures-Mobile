import { sessionStore } from "../lib/browser-storage"
export const LAUNCH_HANDOFF_KEY = "cozycraft-launch-handoff"

export function markLaunchHandoff() {
  try { sessionStore.setItem(LAUNCH_HANDOFF_KEY, "1") } catch { /* private browsing may deny storage */ }
}

export function hasLaunchHandoff() {
  try { return sessionStore.getItem(LAUNCH_HANDOFF_KEY) === "1" } catch { return false }
}

export function clearLaunchHandoff() {
  try { sessionStore.removeItem(LAUNCH_HANDOFF_KEY) } catch { /* private browsing may deny storage */ }
}

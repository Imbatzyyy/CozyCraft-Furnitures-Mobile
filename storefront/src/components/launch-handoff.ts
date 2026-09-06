export const LAUNCH_HANDOFF_KEY = "cozycraft-launch-handoff"

export function markLaunchHandoff() {
  try { window.sessionStorage.setItem(LAUNCH_HANDOFF_KEY, "1") } catch { /* private browsing may deny storage */ }
}

export function hasLaunchHandoff() {
  try { return window.sessionStorage.getItem(LAUNCH_HANDOFF_KEY) === "1" } catch { return false }
}

export function clearLaunchHandoff() {
  try { window.sessionStorage.removeItem(LAUNCH_HANDOFF_KEY) } catch { /* private browsing may deny storage */ }
}

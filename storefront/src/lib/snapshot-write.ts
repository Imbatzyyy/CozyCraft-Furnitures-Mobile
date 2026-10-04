import { localStore } from "./browser-storage"

/** Noncritical snapshots yield to input; auth/payment intents remain synchronous. */
export function scheduleSnapshot(key: string, value: unknown, stillCurrent: () => boolean) {
  let disposed = false
  let idle: number | undefined
  const flush = () => {
    if (disposed || !stillCurrent()) return
    disposed = true
    localStore.setItem(key, JSON.stringify(value))
  }
  const timer = window.setTimeout(() => {
    if ("requestIdleCallback" in window) idle = window.requestIdleCallback(flush, { timeout: 500 })
    else flush()
  }, 120)
  window.addEventListener("pagehide", flush)
  return () => {
    disposed = true
    window.clearTimeout(timer)
    if (idle !== undefined) window.cancelIdleCallback(idle)
    window.removeEventListener("pagehide", flush)
  }
}

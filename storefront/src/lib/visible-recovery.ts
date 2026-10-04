/** Resume signals often arrive together on Capacitor. Never poll in the background. */
export function watchVisibleRecovery(recover: () => void, staleAfter = 30_000) {
  let last = Date.now()
  let dirty = false
  let disposed = false
  const check = () => {
    if (disposed || document.hidden || navigator.onLine === false) return
    if (!dirty && Date.now() - last < staleAfter) return
    dirty = false
    last = Date.now()
    recover()
  }
  const invalidate = () => { dirty = true; check() }
  const native = (event: MessageEvent) => {
    if (event.source === window.parent && event.data?.type === "cozycraft-native-app-active") check()
  }
  window.addEventListener("focus", check)
  window.addEventListener("online", invalidate)
  window.addEventListener("message", native)
  document.addEventListener("visibilitychange", check)
  return {
    invalidate,
    dispose() {
      disposed = true
      window.removeEventListener("focus", check)
      window.removeEventListener("online", invalidate)
      window.removeEventListener("message", native)
      document.removeEventListener("visibilitychange", check)
    },
  }
}

/** Initial hydration already reads data; only subsequent joins need recovery. */
export function recoverOnRejoin(recover: () => void) {
  let joined = false
  return (status: string) => {
    if (status !== "SUBSCRIBED") return
    if (joined) recover()
    joined = true
  }
}

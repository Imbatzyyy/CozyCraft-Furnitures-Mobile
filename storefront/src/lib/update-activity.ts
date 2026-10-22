/** Local-only safety signals. Never sends customer data or adds network traffic. */
export function installUpdateActivityGuard() {
  if (window.parent === window || document.documentElement.dataset.cozyUpdateRequests !== undefined) return
  const root = document.documentElement
  let pending = 0
  const touched = () => { root.dataset.cozyUpdateInteraction = String(Date.now()) }
  touched()
  root.dataset.cozyUpdateRequests = "0"
  for (const type of ["pointerdown", "keydown", "input", "change"]) document.addEventListener(type, touched, { passive: true, capture: true })
  const fetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    root.dataset.cozyUpdateRequests = String(++pending)
    try { return await fetch(...args) }
    finally { root.dataset.cozyUpdateRequests = String(--pending); touched() }
  }
}

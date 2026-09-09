import { useEffect } from "react"

const controls = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
const visible = (element: HTMLElement) => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== "hidden"

/** Keep keyboard focus in the topmost sheet, including nested photo viewers. */
export default function DialogAccessibility() {
  useEffect(() => {
    let active: HTMLElement | null = null
    let initiator: HTMLElement | null = null
    const rememberInitiator = (event: Event) => { initiator = (event.target as HTMLElement)?.closest<HTMLElement>(controls) || null }
    const restore = new Map<HTMLElement, HTMLElement | null>()
    let frame = 0
    const reconcile = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
        .filter(visible).map((element, order) => {
          let layer = 0
          for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
            layer = Math.max(layer, Number.parseInt(getComputedStyle(parent).zIndex) || 0)
          }
          return { element, layer, order }
        }).sort((a, b) => a.layer - b.layer || a.order - b.order).at(-1)?.element || null
      if (next === active) return
      const previous = active
      active = next
      if (previous && !previous.isConnected) {
        const target = restore.get(previous)
        if (target?.isConnected && (!next || next.contains(target))) target.focus({ preventScroll: true })
        restore.delete(previous)
      }
      if (next && !restore.has(next)) restore.set(next, initiator && !next.contains(initiator) ? initiator : document.activeElement as HTMLElement | null)
      if (next && !next.hasAttribute("data-cozy-focus-managed") && !next.contains(document.activeElement)) {
        next.tabIndex = -1
        next.focus({ preventScroll: true })
      }
    }
    const keydown = (event: KeyboardEvent) => {
      if (!active || event.defaultPrevented || active.hasAttribute("data-cozy-focus-managed") || event.key !== "Tab") return
      const items = Array.from(active.querySelectorAll<HTMLElement>(controls)).filter(visible)
      const first = items[0], last = items.at(-1)
      if (!first) { event.preventDefault(); active.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === active)) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    // Coalesce DOM changes from typing, live data, and animations instead of
    // forcing dialog/layout measurement for every React mutation batch.
    const observer = new MutationObserver(() => {
      if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; reconcile() })
    })
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener("keydown", keydown)
    document.addEventListener("pointerdown", rememberInitiator, true)
    document.addEventListener("click", rememberInitiator, true)
    reconcile()
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      document.removeEventListener("keydown", keydown)
      document.removeEventListener("pointerdown", rememberInitiator, true)
      document.removeEventListener("click", rememberInitiator, true)
    }
  }, [])
  return null
}

import { useEffect } from "react"
import { haptic } from "../lib/haptics"
import { prefersReducedMotion } from "../lib/motion"
import { pages, pageSelector } from "./ScrollBackButton"

const EDGE = 24
const COMMIT_RATIO = 0.33
const COMMIT_VELOCITY = 0.45 // px per ms

type Gesture = {
  id: number
  page: HTMLElement
  back: HTMLButtonElement
  startX: number
  startY: number
  startedAt: number
  lastX: number
  lastAt: number
  velocity: number
  mode: "pending" | "swipe" | "ignore"
}

/**
 * iPhone-style back gesture: a drag from the left edge carries the open page
 * with the finger and releases it back to the page beneath. It reuses each
 * page's own back button, so every existing guard (busy checkout, unsaved
 * profile) still applies. Android keeps its system back gesture instead.
 */
export default function EdgeSwipeBack() {
  useEffect(() => {
    let gesture: Gesture | null = null
    const ios = () => document.documentElement.classList.contains("cozy-platform-ios")

    const reset = (page: HTMLElement) => {
      page.classList.remove("is-edge-swiping")
      page.style.removeProperty("transform")
      page.style.removeProperty("transition")
    }

    const start = (event: TouchEvent) => {
      if (!ios() || event.touches.length !== 1 || gesture) return
      const touch = event.touches[0]
      if (touch.clientX > EDGE) return
      const target = event.target instanceof Element ? event.target : null
      const page = target?.closest<HTMLElement>(pageSelector)
      if (!page || page.classList.contains("is-leaving") || page.getAnimations().some(animation => animation.playState === "running")) return
      // Only the topmost sheet may be swiped; a nested dialog keeps the gesture.
      const dialog = target?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]')
      if (dialog && dialog !== page && page.contains(dialog)) return
      const entry = pages.find(([selector]) => page.matches(selector))
      const back = entry ? page.querySelector<HTMLButtonElement>(entry[1]) : null
      if (!back || back.disabled) return
      gesture = { id: touch.identifier, page, back, startX: touch.clientX, startY: touch.clientY, startedAt: event.timeStamp, lastX: touch.clientX, lastAt: event.timeStamp, velocity: 0, mode: "pending" }
    }

    const move = (event: TouchEvent) => {
      if (!gesture) return
      const touch = [...event.changedTouches].find(item => item.identifier === gesture!.id)
      if (!touch) return
      const dx = touch.clientX - gesture.startX
      const dy = touch.clientY - gesture.startY
      if (gesture.mode === "pending") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        gesture.mode = dx > Math.abs(dy) ? "swipe" : "ignore"
        if (gesture.mode === "ignore") { gesture = null; return }
        gesture.page.classList.add("is-edge-swiping")
        gesture.page.style.transition = "none"
      }
      if (gesture.mode !== "swipe") return
      if (event.cancelable) event.preventDefault()
      const elapsed = Math.max(1, event.timeStamp - gesture.lastAt)
      gesture.velocity = (touch.clientX - gesture.lastX) / elapsed
      gesture.lastX = touch.clientX
      gesture.lastAt = event.timeStamp
      gesture.page.style.transform = `translate3d(${Math.max(0, dx)}px, 0, 0)`
    }

    const end = (event: TouchEvent) => {
      if (!gesture) return
      const touch = [...event.changedTouches].find(item => item.identifier === gesture!.id)
      if (!touch && event.type !== "touchcancel") return
      const { page, back, mode, startX, velocity } = gesture
      gesture = null
      if (mode !== "swipe") return
      const width = page.getBoundingClientRect().width || window.innerWidth
      const dx = Math.max(0, (touch?.clientX ?? startX) - startX)
      const commit = event.type !== "touchcancel" && !back.disabled && (dx > width * COMMIT_RATIO || (velocity > COMMIT_VELOCITY && dx > 40))
      const settle = (to: string, after: () => void) => {
        if (prefersReducedMotion()) { after(); return }
        page.style.transition = "transform 240ms cubic-bezier(.2,.8,.2,1)"
        page.style.transform = to
        let done = false
        const finish = () => { if (done) return; done = true; after() }
        page.addEventListener("transitionend", finish, { once: true })
        window.setTimeout(finish, 300)
      }
      if (commit) {
        settle(`translate3d(${width}px, 0, 0)`, () => {
          // Stay off-screen while the page unmounts; its exit animation is skipped.
          page.classList.add("is-edge-dismissed")
          haptic("light")
          back.click()
          // A page that declined to close (a guard kept it open) glides back.
          window.setTimeout(() => {
            if (!page.isConnected || page.classList.contains("is-leaving")) return
            page.classList.remove("is-edge-dismissed")
            settle("translate3d(0, 0, 0)", () => reset(page))
          }, 400)
        })
      } else {
        settle("translate3d(0, 0, 0)", () => reset(page))
      }
    }

    document.addEventListener("touchstart", start, { passive: true, capture: true })
    document.addEventListener("touchmove", move, { passive: false, capture: true })
    document.addEventListener("touchend", end, { capture: true })
    document.addEventListener("touchcancel", end, { capture: true })
    return () => {
      document.removeEventListener("touchstart", start, { capture: true })
      document.removeEventListener("touchmove", move, { capture: true })
      document.removeEventListener("touchend", end, { capture: true })
      document.removeEventListener("touchcancel", end, { capture: true })
    }
  }, [])
  return null
}

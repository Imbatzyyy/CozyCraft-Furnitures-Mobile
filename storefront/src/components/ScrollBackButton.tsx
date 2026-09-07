import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import "./scroll-back-button.css"

// Each entry delegates to the same control customers already use at the top.
const pages = [
  [".detail-sheet", ":scope > header button[aria-label='Return to collection']"],
  [".profile-page", ":scope > header button:first-child"],
  [".category-page", ":scope > header button:first-child"],
  [".notifications-page", ":scope > header button:first-child"],
  [".home-circle", ":scope > header button:first-child"],
  [".search-overlay", ":scope > header .dismiss"],
  [".mobile-ai-chat", ":scope > header button:first-child"],
  [".order-detail-view", ":scope > header .order-detail-close"],
  [".account-sheet", ":scope > .account-sheet-close"],
  [".compare-sheet", ":scope > header button:first-child"],
  [".legal-document", ":scope > .document-header button"],
] as const
const pageSelector = pages.map(([selector]) => selector).join(",")
const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
type Target = { page: HTMLElement; back: HTMLButtonElement; left: number; bottom: number }

export default function ScrollBackButton() {
  const [target, setTarget] = useState<Target | null>(null)
  useEffect(() => {
    let frame = 0
    let currentPage: HTMLElement | null = null
    const scrollers = new Set<HTMLElement>()
    const update = () => {
      frame = 0
      const viewport = window.visualViewport
      const viewBottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight)
      const hit = document.elementFromPoint(innerWidth / 2, Math.max(1, viewBottom / 2))
      const page = hit?.closest<HTMLElement>(pageSelector) || null
      const dialog = hit?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const editing = document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')
      if (!page || (dialog && dialog !== page && !dialog.contains(page)) || editing || !visible(page)) {
        setTarget(previous => previous ? null : previous)
        return
      }
      if (page !== currentPage) {
        currentPage = page
        scrollers.clear()
        for (const element of [page, ...page.querySelectorAll<HTMLElement>("*")]) {
          if (element.scrollTop > 0) scrollers.add(element)
        }
        for (let parent = page.parentElement; parent; parent = parent.parentElement) scrollers.add(parent)
        if (document.scrollingElement) scrollers.add(document.scrollingElement as HTMLElement)
      }
      const entry = pages.find(([selector]) => page.matches(selector))!
      const back = page.querySelector<HTMLButtonElement>(entry[1])
      const scrolled = [...scrollers].some(el => el.isConnected && (page.contains(el) || el.contains(page)) && el.scrollTop >= 280 && el.scrollHeight - el.clientHeight >= 360)
      if (!back || back.disabled || !scrolled) { setTarget(previous => previous ? null : previous); return }
      const bounds = page.getBoundingClientRect()
      let bottom = Math.max(18, innerHeight - viewBottom + 18)
      // Reserve space above pinned navigation and page-specific action bars.
      for (const element of document.querySelectorAll<HTMLElement>(".lux-nav, .mobile-ai-chat > form, .profile-save, .detail-sticky-buy, .atelier-detail-buybar")) {
        if (!visible(element)) continue
        const rect = element.getBoundingClientRect()
        if (rect.bottom >= viewBottom - 140 && rect.top > viewBottom / 2 && rect.left < bounds.left + 100) bottom = Math.max(bottom, innerHeight - rect.top + 12)
      }
      const next = { page, back, left: Math.max(16, bounds.left + 16), bottom }
      setTarget(previous => previous?.page === page && previous.back === back && previous.left === next.left && previous.bottom === bottom ? previous : next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const scroll = (event: Event) => {
      for (const element of scrollers) if (!element.isConnected) scrollers.delete(element)
      if (event.target instanceof HTMLElement && currentPage && (currentPage.contains(event.target) || event.target.contains(currentPage))) scrollers.add(event.target)
      schedule()
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:["disabled","aria-hidden"]})
    document.addEventListener("scroll", scroll, true)
    document.addEventListener("focusin", schedule)
    document.addEventListener("focusout", schedule)
    window.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("resize", schedule)
    schedule()
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame)
      document.removeEventListener("scroll", scroll, true)
      document.removeEventListener("focusin", schedule); document.removeEventListener("focusout", schedule)
      window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule)
    }
  }, [])
  if (!target) return null
  return createPortal(<button type="button" className="cozy-scroll-back" aria-label="Back to previous page" style={{left:target.left,bottom:`max(${target.bottom}px, calc(env(safe-area-inset-bottom) + 12px))`}} onClick={() => {
    if (target.back.isConnected && !target.back.disabled) target.back.click()
    setTarget(null)
  }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m11 5-7 7 7 7M4 12h16"/></svg><span>Back</span></button>, target.page)
}

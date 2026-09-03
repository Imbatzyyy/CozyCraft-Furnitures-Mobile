import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export default function SecurityDialog({ titleId, children, busy, close }: {
  titleId: string; children: ReactNode; busy: boolean; close: () => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null)
  const latest = useRef({ busy, close })
  latest.current = { busy, close }
  useEffect(() => {
    // iOS can shrink only the visual viewport when the SMS keyboard opens.
    // Keep the scrollable dialog above it without resizing the profile below.
    const visible = window.visualViewport
    if (!visible) return
    const resize = () => setViewport({ top: visible.offsetTop, height: visible.height })
    resize()
    visible.addEventListener("resize", resize)
    visible.addEventListener("scroll", resize)
    return () => { visible.removeEventListener("resize", resize); visible.removeEventListener("scroll", resize) }
  }, [])
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const root = document.getElementById("root")
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    element.current?.focus()
    const dismiss = () => { if (!latest.current.busy) latest.current.close() }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); dismiss() }
      if (event.key !== "Tab") return
      const controls = Array.from(element.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
      ) ?? [])
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element.current)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element.current)) {
        event.preventDefault(); first.focus()
      }
    }
    const nativeBack = (event: MessageEvent) => {
      if (event.data?.type !== "cozycraft-native-back" || event.source !== window.parent) return
      event.stopImmediatePropagation()
      dismiss()
    }
    document.addEventListener("keydown", keyboard, true)
    window.addEventListener("message", nativeBack, true)
    return () => {
      if (root) root.inert = wasInert
      document.removeEventListener("keydown", keyboard, true)
      window.removeEventListener("message", nativeBack, true)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])
  return createPortal(
    <div className="mobile-security-overlay" style={viewport ? { top: viewport.top, height: viewport.height, bottom: "auto" } : undefined}>
      <div ref={element} className="mobile-security-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {children}
      </div>
    </div>, document.body,
  )
}

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

export default function ReviewPhotoViewer({ photos, initialIndex, description, close }: {
  photos: string[]; initialIndex: number; description: string; close: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const stage = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButton.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  useEffect(() => { stage.current?.scrollTo?.(0, 0) }, [index])
  const resize = (value: number) => {
    setZoom(Math.max(1, Math.min(3, value)))
    if (value <= 1) stage.current?.scrollTo?.(0, 0)
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close() } }
    document.addEventListener("keydown", escape, true)
    return () => document.removeEventListener("keydown", escape, true)
  }, [close])
  const move = (offset: number) => { setFailed(false); setZoom(1); setIndex((value) => (value + offset + photos.length) % photos.length) }
  return createPortal(<section className="review-photo-viewer" role="dialog" aria-modal="true" aria-label="Customer review photos" onKeyDown={(event) => {
    if (event.key === "Tab") {
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    if (event.key === "ArrowLeft") move(-1)
    if (event.key === "ArrowRight") move(1)
  }}>
    <header><p>{description}</p><button ref={closeButton} type="button" onClick={close} aria-label="Close review photos"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div ref={stage} className="review-photo-stage">{failed ? <p role="status">This photo could not load. Please check your connection.</p> : <div className="review-photo-canvas" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}><img key={photos[index]} src={photos[index]} alt={`${description}, photo ${index + 1}`} decoding="async" draggable={false} onDoubleClick={() => resize(zoom === 1 ? 2 : 1)} onError={() => setFailed(true)}/></div>}</div>
    <div className="review-photo-zoom" aria-label="Photo zoom controls"><button type="button" disabled={failed || zoom <= 1} aria-label="Zoom out" onClick={() => resize(zoom - .5)}>−</button><span aria-live="polite">{Math.round(zoom * 100)}%</span><button type="button" disabled={failed || zoom >= 3} aria-label="Zoom in" onClick={() => resize(zoom + .5)}>+</button></div>
    <footer><button type="button" disabled={photos.length < 2} onClick={() => move(-1)} aria-label="Previous photo">←</button><span aria-live="polite">{index + 1} of {photos.length}</span><button type="button" disabled={photos.length < 2} onClick={() => move(1)} aria-label="Next photo">→</button></footer>
  </section>, document.body)
}

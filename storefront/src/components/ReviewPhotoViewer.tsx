import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

export default function ReviewPhotoViewer({ photos, initialIndex, description, close }: {
  photos: string[]; initialIndex: number; description: string; close: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close() } }
    document.addEventListener("keydown", escape, true)
    return () => document.removeEventListener("keydown", escape, true)
  }, [close])
  const move = (offset: number) => { setFailed(false); setIndex((value) => (value + offset + photos.length) % photos.length) }
  return createPortal(<section className="review-photo-viewer" role="dialog" aria-modal="true" aria-label="Customer review photos" onKeyDown={(event) => {
    if (event.key === "ArrowLeft") move(-1)
    if (event.key === "ArrowRight") move(1)
  }}>
    <header><p>{description}</p><button type="button" onClick={close} aria-label="Close review photos"><span className="material-symbols-rounded" aria-hidden="true">close</span></button></header>
    <div className="review-photo-stage">{failed ? <p role="status">This photo could not load. Please check your connection.</p> : <img key={photos[index]} src={photos[index]} alt={`${description}, photo ${index + 1}`} onError={() => setFailed(true)}/>}</div>
    <footer><button type="button" disabled={photos.length < 2} onClick={() => move(-1)} aria-label="Previous photo">←</button><span aria-live="polite">{index + 1} of {photos.length}</span><button type="button" disabled={photos.length < 2} onClick={() => move(1)} aria-label="Next photo">→</button></footer>
  </section>, document.body)
}

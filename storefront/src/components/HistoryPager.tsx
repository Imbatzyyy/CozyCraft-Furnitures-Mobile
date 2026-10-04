import { useEffect } from "react"
import "./history-pager.css"

export default function HistoryPager({ page, total, size = 5, busy, change }: {
  page: number; total: number; size?: number; busy?: boolean; change: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  useEffect(() => {
    // A deletion/moderation event can remove the last page while it is open.
    if (!busy && page > pages) change(pages)
  }, [page, pages, busy, change])
  if (pages === 1 && page === 1) return null
  return <nav className="history-pager" aria-label="History pages" aria-busy={busy}>
    <button type="button" disabled={busy || page <= 1} onClick={() => change(page - 1)}>← Previous</button>
    <span aria-live="polite">Page {page} of {pages}</span>
    <button type="button" disabled={busy || page >= pages} onClick={() => change(page + 1)}>Next →</button>
  </nav>
}

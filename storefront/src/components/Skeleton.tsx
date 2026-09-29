import { useEffect, useState } from "react"

/**
 * Placeholder shapes shown while a customer's own data is on its way, so an
 * empty state ("Your bag is empty") never flashes before real content.
 */
export function SkeletonCards({ count = 4, label }: { count?: number; label: string }) {
  return <div className="cozy-skeleton-grid" role="status" aria-label={label}>
    {Array.from({ length: count }, (_, index) => <div className="cozy-skeleton-card" key={index} aria-hidden="true">
      <span className="cozy-skeleton cozy-skeleton--media" />
      <span className="cozy-skeleton cozy-skeleton--line" />
      <span className="cozy-skeleton cozy-skeleton--line is-short" />
    </div>)}
  </div>
}

export function SkeletonRows({ count = 3, label, media = true }: { count?: number; label: string; media?: boolean }) {
  return <div className="cozy-skeleton-rows" role="status" aria-label={label}>
    {Array.from({ length: count }, (_, index) => <div className={`cozy-skeleton-row${media ? " has-media" : ""}`} key={index} aria-hidden="true">
      {media && <span className="cozy-skeleton cozy-skeleton--thumb" />}
      <span className="cozy-skeleton-row-copy">
        <span className="cozy-skeleton cozy-skeleton--line" />
        <span className="cozy-skeleton cozy-skeleton--line is-short" />
        {!media && <span className="cozy-skeleton cozy-skeleton--line is-tiny" />}
      </span>
    </div>)}
  </div>
}

/** True while `loading`, but never longer than `limit` — then the real state shows. */
export function useBoundedLoading(loading: boolean, limit = 8000) {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!loading) { setExpired(false); return }
    const timer = window.setTimeout(() => setExpired(true), limit)
    return () => window.clearTimeout(timer)
  }, [loading, limit])
  return loading && !expired
}

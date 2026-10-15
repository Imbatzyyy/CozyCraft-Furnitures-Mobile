import { useCallback, useEffect, useState } from "react"
import { loadMobileContentPage, readMobileContentSnapshot, type MobileContentPage } from "../../lib/mobile-data"

export default function useInformationPage(slug: string) {
  const [state, setState] = useState<{ slug: string; page: MobileContentPage | null; loading: boolean; failed: boolean }>(() => ({ slug, page: readMobileContentSnapshot(slug), loading: true, failed: false }))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setState({ slug, page: readMobileContentSnapshot(slug), loading: true, failed: false })
    void loadMobileContentPage(slug, attempt > 0).then(page => {
      if (active) setState({ slug, page, loading: false, failed: !page })
    }).catch(() => {
      if (active) setState({ slug, page: readMobileContentSnapshot(slug), loading: false, failed: true })
    })
    return () => { active = false }
  }, [slug, attempt])
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  return { ...(state.slug === slug ? state : { slug, page: readMobileContentSnapshot(slug), loading: true, failed: false }), retry }
}

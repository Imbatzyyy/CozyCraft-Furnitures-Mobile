import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CozyCompanion from '../../components/CozyCompanion'
import { supabase } from '../../lib/supabase'
import { peso, type MobileRedemption } from '../../lib/mobile-data'
import { withDeadline } from '../../lib/request-lifecycle'
import './shopping-notifications.css'

export default function ShoppingOffer({ userId, rewardId, close, shop }: { userId: string; rewardId: string; close: () => void; shop: () => void }) {
  const [reward, setReward] = useState<MobileRedemption | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [now, setNow] = useState(Date.now())
  const dialog = useRef<HTMLDivElement>(null)
  const dismiss = useRef(close); dismiss.current = close
  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setReward(null)
    void withDeadline(supabase.from('mobile_loyalty_redemptions').select('*').eq('user_id', userId).eq('id', rewardId)
      .eq('reward_source', 'surprise').maybeSingle()).then(({ data, error }) => {
        if (!alive) return
        if (error) setError('We could not check this offer. Please try again when you are online.')
        else setReward(data as MobileRedemption | null)
        setLoading(false); setNow(Date.now())
      }).catch(() => { if (alive) { setError('We could not check this offer. Please try again when you are online.'); setLoading(false) } })
    return () => { alive = false }
  }, [userId, rewardId, retry])
  useEffect(() => {
    if (!reward) return
    const delay = Date.parse(reward.expires_at) - Date.now()
    if (delay <= 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(delay + 20, 2147483647))
    return () => clearTimeout(timer)
  }, [reward])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    const wasInert = root?.inert || false
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    if (root) root.inert = true
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dismiss.current() }
      if (event.key !== 'Tab') return
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') || [])
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    const back = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === 'cozycraft-native-back') { event.stopImmediatePropagation(); dismiss.current() }
    }
    window.addEventListener('keydown', keys, true); window.addEventListener('message', back, true)
    return () => {
      window.removeEventListener('keydown', keys, true); window.removeEventListener('message', back, true)
      if (root) root.inert = wasInert
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  const available = reward?.status === 'available' && Date.parse(reward.expires_at) > now
  return createPortal(<div className="shopping-offer-backdrop" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <div className="shopping-offer" role="dialog" aria-modal="true" aria-labelledby="shopping-offer-title" ref={dialog}>
      <header><span>COZY SURPRISES</span><button type="button" aria-label="Close offer" onClick={close}>×</button></header>
      <div className="shopping-offer-content">
        <CozyCompanion pose="tour-voucher" compact />
        <h1 id="shopping-offer-title">{loading ? 'A little surprise…' : available ? 'A little comfort, for you.' : 'Let’s check your surprise.'}</h1>
        {loading ? <p role="status">Checking the latest offer details…</p> : error ? <><p role="alert">{error}</p><button className="shopping-primary" onClick={() => setRetry(v => v + 1)}>Try again</button></> : available && reward ? <>
          <p className="shopping-offer-amount">{peso(Number(reward.discount_amount))} off</p>
          <p>On a merchandise subtotal of {peso(Number(reward.minimum_order_amount))} or more.</p>
          <p className="shopping-offer-code">{reward.code}</p>
          <p>Valid until <strong>{new Date(reward.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>.</p>
          <p className="shopping-offer-terms">Already in your Home Circle wallet. One use on your account; cannot be combined with another Home Circle reward. Select it at checkout. Availability and final totals are checked before payment.</p>
          <button type="button" className="shopping-primary" onClick={shop}>Shop this offer <span aria-hidden="true">→</span></button>
        </> : <><p>This offer has expired, was already used, or is no longer available. Your other rewards remain in your Home Circle wallet.</p><button className="shopping-primary" onClick={close}>Continue browsing</button></>}
      </div>
    </div>
  </div>, document.body)
}

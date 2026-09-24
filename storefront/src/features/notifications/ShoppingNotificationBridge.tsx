import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { markNotification } from '../../lib/mobile-data'
import { withDeadline } from '../../lib/request-lifecycle'
import ShoppingOffer from './ShoppingOffer'
import { resolveShoppingNotification, shoppingNotificationDestination } from './shopping-notifications'

export default function ShoppingNotificationBridge({ userId, blocked, requestedId, settled, navigate, notice, onOpenChange }: {
  userId: string; blocked: boolean; requestedId: string; settled: () => void
  navigate: (destination: 'bag' | 'saved' | 'shop' | 'notifications') => void
  notice: (message: string) => void; onOpenChange: (open: boolean) => void
}) {
  const [pending, setPending] = useState('')
  const [offer, setOffer] = useState<{ userId: string; id: string } | null>(null)
  const handled = useRef(new Set<string>())
  const callbacks = useRef({ navigate, notice, settled, onOpenChange })
  callbacks.current = { navigate, notice, settled, onOpenChange }
  const inFlight = useRef('')
  useEffect(() => {
    if (requestedId) setPending(requestedId)
  }, [requestedId])
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      if (event.data?.type !== 'cozycraft-open-notifications') return
      const id = String(event.data.notificationId || '')
      if (/^[1-9]\d{0,15}$/.test(id)) {
        if (!handled.current.has(id)) setPending(id)
        else window.parent.postMessage({ type: 'cozycraft-notification-consumed', notificationId: id }, '*')
      }
    }
    window.addEventListener('message', receive)
    if (window.parent !== window) window.parent.postMessage({ type: 'cozycraft-notifications-ready' }, '*')
    return () => window.removeEventListener('message', receive)
  }, [])
  useEffect(() => {
    if (!userId || !pending || blocked || offer?.userId === userId) return
    let alive = true
    const key = `${userId}:${pending}`
    inFlight.current = key
    const id = pending
    void (async () => {
      try {
        const row = await resolveShoppingNotification(userId, id)
        const { data } = await withDeadline(supabase.auth.getSession())
        if (!alive || inFlight.current !== key || data.session?.user.id !== userId) return
        const target = row ? shoppingNotificationDestination(row) : null
        if (!row) callbacks.current.notice('This notification is no longer available for this account.')
        else if (target === 'offer') setOffer({ userId, id: String(row.entity_id) })
        else callbacks.current.navigate(target || 'notifications')
        if (row) void markNotification(userId, id).catch(() => undefined)
      } catch {
        if (!alive) return
        callbacks.current.notice('Could not open this notification. Please try again from Notifications when you are online.')
        callbacks.current.navigate('notifications')
      }
      if (!alive) return
      handled.current.add(id)
      setPending(''); callbacks.current.settled()
      window.parent.postMessage({ type: 'cozycraft-notification-consumed', notificationId: id }, '*')
    })()
    return () => { alive = false }
  }, [userId, pending, blocked, offer])
  useEffect(() => {
    const open = Boolean(offer && offer.userId === userId)
    callbacks.current.onOpenChange(open)
    return () => callbacks.current.onOpenChange(false)
  }, [offer, userId])
  useEffect(() => { setOffer(null) }, [userId])
  if (!offer || offer.userId !== userId) return null
  return <ShoppingOffer userId={userId} rewardId={offer.id} close={() => setOffer(null)}
    shop={() => { setOffer(null); callbacks.current.navigate('shop') }} />
}

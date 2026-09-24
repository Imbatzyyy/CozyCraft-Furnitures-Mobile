import { useEffect, useRef, useState } from 'react'
import { defaultShoppingPreferences, deviceTimeZone, loadShoppingPreferences, saveShoppingPreferences, type ShoppingPreferences as Preferences } from './shopping-notifications'
import './shopping-notifications.css'
import { normalizeMobilePushPermission, readMobilePushPermission } from '../../lib/mobile-push-permission'

export default function ShoppingPreferences({ userId }: { userId: string }) {
  const [value, setValue] = useState<Preferences>(defaultShoppingPreferences)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [permission, setPermission] = useState(readMobilePushPermission)
  const [requestingPermission, setRequestingPermission] = useState(false)
  const lock = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'cozycraft-push-permission') return
      setPermission(normalizeMobilePushPermission(event.data.status)); setRequestingPermission(false)
    }
    window.addEventListener('message', receive)
    if (window.parent !== window) window.parent.postMessage({ type: 'cozycraft-request-push-permission-status' }, '*')
    return () => window.removeEventListener('message', receive)
  }, [])
  useEffect(() => {
    const current = ++generation.current
    setReady(false); setNotice(''); setValue(defaultShoppingPreferences); lock.current = false; setBusy(false)
    void loadShoppingPreferences(userId).then(data => {
      if (generation.current === current) { setValue(data); setReady(true) }
    }).catch(() => { if (generation.current === current) setNotice('Shopping reminder settings are unavailable. Your existing choices have not changed.') })
    return () => { generation.current++ }
  }, [userId, retry])
  const change = async (key: 'offers' | 'cart' | 'wishlist') => {
    if (!ready || lock.current) return
    lock.current = true; setBusy(true); setNotice('')
    const current = generation.current
    try {
      const next = await saveShoppingPreferences({ ...value, [key]: !value[key], timezone: deviceTimeZone() })
      if (current === generation.current) { setValue(next); setNotice('Your shopping notification preferences are saved.') }
    } catch { if (current === generation.current) { setReady(false); setNotice('Could not confirm your saved choices. Retry settings to check them before making another change.') } }
    finally { if (current === generation.current) { lock.current = false; setBusy(false) } }
  }
  return <section className="shopping-preferences" aria-labelledby="shopping-preferences-title" aria-busy={busy}>
    <p className="hello">THOUGHTFULLY TIMED</p>
    <h3 id="shopping-preferences-title">A little nudge, only if you like.</h3>
    <p>Choose the shopping notifications you want. These are optional and separate from order updates. Your phone must also allow CozyCraft notifications.</p>
    {([
      ['offers', 'Offers and surprises', 'Occasional limited-time vouchers and offers.'],
      ['cart', 'Cart reminders', 'A gentle reminder about pieces left in your bag.'],
      ['wishlist', 'Wishlist reminders', 'An occasional invitation to revisit your favorites.'],
    ] as const).map(([key, title, description]) => <button key={key} type="button" role="switch" aria-checked={value[key]} aria-label={title}
      disabled={!ready || busy} onClick={() => void change(key)}>
      <span><b>{title}</b><small>{description}</small></span><span className="shopping-toggle" aria-hidden="true" data-on={value[key]}><i /></span>
    </button>)}
    <small>At most 2 shopping messages in 7 days, spaced at least 48 hours apart. Sending hours: 10 AM–7 PM ({value.timezone}). Turn off any category here at any time.</small>
    {ready && (value.offers || value.cart || value.wishlist) && window.parent !== window && permission !== 'granted' && <div className="shopping-device-permission">
      {permission === 'denied' ? <p>Notifications are off for this phone. You can enable CozyCraft notifications in your phone’s Settings; your category choices above are saved.</p> : <button type="button" className="shopping-retry" disabled={requestingPermission} onClick={() => {
        setRequestingPermission(true)
        window.parent.postMessage({ type: 'cozycraft-request-push-permission' }, '*')
      }}>{requestingPermission ? 'Waiting for your phone…' : 'Enable notifications on this phone'}</button>}
    </div>}
    <p role="status" aria-live="polite">{notice}</p>
    {!ready && notice && <button type="button" className="shopping-retry" onClick={() => setRetry(v => v + 1)}>Retry settings</button>}
  </section>
}

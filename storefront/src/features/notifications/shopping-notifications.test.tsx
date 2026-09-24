import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), result: null as any, getSession: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mock.from, rpc: mock.rpc, auth: { getSession: mock.getSession } } }))
vi.mock('../../lib/mobile-data', () => ({ markNotification: vi.fn().mockResolvedValue(undefined), peso: (value: number) => `PHP ${value}` }))
vi.mock('../../components/CozyCompanion', () => ({ default: () => <div>Companion</div> }))
import { defaultShoppingPreferences, isShoppingNotification, shoppingNotificationDestination } from './shopping-notifications'
import ShoppingPreferences from './ShoppingPreferences'
import ShoppingOffer from './ShoppingOffer'
import ShoppingNotificationBridge from './ShoppingNotificationBridge'
const rewardId = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  mock.result = { data: null, error: null }
  const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(() => Promise.resolve(mock.result)) }
  mock.from.mockReturnValue(query)
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'customer' } } } })
})
describe('shopping preferences', () => {
  it('defaults to opt-out and prevents rapid duplicate saves', async () => {
    expect(defaultShoppingPreferences.offers).toBe(false)
    let finish!: (value: unknown) => void
    mock.rpc.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<ShoppingPreferences userId="customer" />)
    const offers = screen.getByRole('switch', { name: 'Offers and surprises' })
    await waitFor(() => expect(offers.hasAttribute('disabled')).toBe(false))
    fireEvent.click(offers); fireEvent.click(offers)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(offers.getAttribute('aria-checked')).toBe('false')
    await act(async () => finish({ data: { ...defaultShoppingPreferences, offers: true }, error: null }))
    expect(offers.getAttribute('aria-checked')).toBe('true')
  })
  it('failed save does not pretend that consent was saved', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('offline') })
    render(<ShoppingPreferences userId="customer" />)
    const cart = screen.getByRole('switch', { name: 'Cart reminders' })
    await waitFor(() => expect(cart.hasAttribute('disabled')).toBe(false))
    fireEvent.click(cart)
    await screen.findByText(/Could not confirm/)
    expect(cart.getAttribute('aria-checked')).toBe('false')
  })
  it('fails closed if the backend migration is not yet installed', async () => {
    mock.result = { data: null, error: new Error('relation missing') }
    render(<ShoppingPreferences userId="customer" />)
    await screen.findByText(/Shopping reminder settings are unavailable/)
    expect(screen.getByRole('switch', { name: 'Offers and surprises' }).hasAttribute('disabled')).toBe(true)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
describe('notification destinations', () => {
  it('does not mirror marketing realtime inserts into duplicate local notifications', () => {
    for (const kind of ['promotion','cart_reminder','wishlist_reminder','shopping_offer']) expect(isShoppingNotification(kind)).toBe(true)
    expect(isShoppingNotification('order_confirmation')).toBe(false)
  })
  it('uses only known internal destinations and validated offer IDs', () => {
    expect(shoppingNotificationDestination({ kind: 'cart_reminder', route: 'https://evil.test' })).toBe('bag')
    expect(shoppingNotificationDestination({ kind: 'wishlist_reminder' })).toBe('saved')
    expect(shoppingNotificationDestination({ kind: 'shopping_offer', entity_type: 'mobile_reward', entity_id: rewardId })).toBe('offer')
    expect(shoppingNotificationDestination({ kind: 'shopping_offer', entity_type: 'mobile_reward', entity_id: '../../checkout' })).toBeNull()
    expect(shoppingNotificationDestination({ kind: 'unknown' })).toBeNull()
  })
  it('waits for onboarding or payment to finish before opening the bag', async () => {
    mock.result = { data: { id: 42, user_id: 'customer', kind: 'cart_reminder' }, error: null }
    const props = { userId: 'customer', requestedId: '42', settled: vi.fn(), navigate: vi.fn(), notice: vi.fn(), onOpenChange: vi.fn() }
    const view = render(<ShoppingNotificationBridge {...props} blocked />)
    expect(mock.from).not.toHaveBeenCalled()
    view.rerender(<ShoppingNotificationBridge {...props} blocked={false} />)
    await waitFor(() => expect(props.navigate).toHaveBeenCalledWith('bag'))
    expect(props.navigate).toHaveBeenCalledTimes(1)
  })
  it('does not navigate when the authenticated account changed during the request', async () => {
    mock.result = { data: { id: 42, kind: 'cart_reminder' }, error: null }
    mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'different' } } } })
    const navigate = vi.fn()
    render(<ShoppingNotificationBridge userId="customer" requestedId="42" settled={vi.fn()} navigate={navigate} notice={vi.fn()} onOpenChange={vi.fn()} blocked={false} />)
    await waitFor(() => expect(mock.getSession).toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
  })
})
describe('offer presentation', () => {
  it('shows the real amount, minimum and expiry without manufacturing a new offer', async () => {
    mock.result = { data: { id: rewardId, reward_source: 'surprise', status: 'available', expires_at: '2099-10-01', discount_amount: 100, minimum_order_amount: 10000, code: 'COZY-TEST' }, error: null }
    const shop = vi.fn()
    render(<ShoppingOffer userId="customer" rewardId={rewardId} close={vi.fn()} shop={shop} />)
    await screen.findByText('PHP 100 off')
    expect(screen.getByText(/PHP 10000/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Shop this offer/ }))
    expect(shop).toHaveBeenCalledTimes(1)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it.each(['expired','used','cancelled'])('cannot shop a %s reward', async (status) => {
    mock.result = { data: { id: rewardId, status, expires_at: '2020-01-01' }, error: null }
    render(<ShoppingOffer userId="customer" rewardId={rewardId} close={vi.fn()} shop={vi.fn()} />)
    await screen.findByText(/This offer has expired/)
    expect(screen.queryByRole('button', { name: /Shop this offer/ })).toBeNull()
  })
  it('supports Escape and restores focus', async () => {
    const close = vi.fn(), button = document.createElement('button')
    document.body.append(button); button.focus()
    const view = render(<ShoppingOffer userId="customer" rewardId={rewardId} close={close} shop={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
    view.unmount(); expect(document.activeElement).toBe(button); button.remove()
  })
})

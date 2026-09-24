import { supabase } from '../../lib/supabase'
import { withDeadline } from '../../lib/request-lifecycle'

export type ShoppingPreferences = { offers: boolean; cart: boolean; wishlist: boolean; timezone: string }
export const defaultShoppingPreferences: ShoppingPreferences = { offers: false, cart: false, wishlist: false, timezone: 'Asia/Manila' }
export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila' } catch { return 'Asia/Manila' }
}
export async function loadShoppingPreferences(userId: string): Promise<ShoppingPreferences> {
  const { data, error } = await withDeadline(supabase.from('mobile_shopping_preferences')
    .select('offers,cart,wishlist,timezone').eq('user_id', userId).maybeSingle())
  if (error) throw error
  return data ? { offers: data.offers === true, cart: data.cart === true, wishlist: data.wishlist === true, timezone: data.timezone } : { ...defaultShoppingPreferences, timezone: deviceTimeZone() }
}
export async function saveShoppingPreferences(value: ShoppingPreferences) {
  const { data, error } = await withDeadline(supabase.rpc('set_mobile_shopping_preferences', {
    p_offers: value.offers, p_cart: value.cart, p_wishlist: value.wishlist, p_timezone: value.timezone,
  }))
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row.offers !== 'boolean' || typeof row.cart !== 'boolean' || typeof row.wishlist !== 'boolean' || typeof row.timezone !== 'string') {
    throw new Error('Could not confirm saved preferences')
  }
  return { offers: row.offers, cart: row.cart, wishlist: row.wishlist, timezone: row.timezone } as ShoppingPreferences
}
export type ShoppingDestination = 'bag' | 'saved' | 'offer'
export function isShoppingNotification(kind: unknown) {
  return ['promotion', 'cart_reminder', 'wishlist_reminder', 'shopping_offer'].includes(String(kind))
}
export function shoppingNotificationDestination(item: Record<string, unknown>): ShoppingDestination | null {
  if (item.kind === 'cart_reminder') return 'bag'
  if (item.kind === 'wishlist_reminder') return 'saved'
  if (item.kind === 'shopping_offer' && item.entity_type === 'mobile_reward' &&
    typeof item.entity_id === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(item.entity_id)) return 'offer'
  return null
}
export async function resolveShoppingNotification(userId: string, id: string) {
  if (!/^[1-9]\d{0,15}$/.test(id)) return null
  const { data, error } = await withDeadline(supabase.from('customer_notifications')
    .select('id,user_id,kind,title,message,entity_type,entity_id,read_at').eq('id', id).eq('user_id', userId).maybeSingle())
  if (error) throw error
  return data
}

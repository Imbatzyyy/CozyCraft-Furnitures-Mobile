export const shoppingKinds = new Set(['promotion', 'cart_reminder', 'wishlist_reminder', 'shopping_offer']);
export function shoppingPushOptions(kind: string, expiresAt?: string, now = Date.now()) {
  const marketing = shoppingKinds.has(kind);
  const remaining = expiresAt ? Math.floor((Date.parse(expiresAt) - now) / 1000) : 86400;
  return {
    marketing,
    channel: marketing ? 'cozycraft_shopping_v1' : 'cozycraft_important_v2',
    ttl: Math.max(0, Math.min(172800, Number.isFinite(remaining) ? remaining : 0)),
    route: kind === 'cart_reminder' ? '/bag' : kind === 'wishlist_reminder' ? '/saved' : kind === 'shopping_offer' ? '/offer' : '/notifications',
  };
}

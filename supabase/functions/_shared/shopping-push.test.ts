import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shoppingPushOptions } from './shopping-push.ts';
test('marketing has its own channel and uses the real offer expiration', () => {
  const value = shoppingPushOptions('shopping_offer', '2026-09-26T00:00:00Z', Date.parse('2026-09-25T00:00:00Z'));
  assert.equal(value.channel, 'cozycraft_shopping_v1'); assert.equal(value.ttl, 86400); assert.equal(value.route, '/offer');
});
test('invalid or expired TTL is never extended', () => {
  assert.equal(shoppingPushOptions('shopping_offer', 'invalid').ttl, 0);
  assert.equal(shoppingPushOptions('shopping_offer', '2000-01-01').ttl, 0);
});
test('all four marketing kinds are separate from order updates', () => {
  for (const kind of ['promotion','cart_reminder','wishlist_reminder','shopping_offer']) assert.equal(shoppingPushOptions(kind).marketing,true);
  assert.equal(shoppingPushOptions('order_confirmation').channel,'cozycraft_important_v2');
});

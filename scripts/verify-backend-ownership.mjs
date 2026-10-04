import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
for (const name of ['create-paymongo-checkout','verify-mobile-payment']) {
  assert.equal(existsSync(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url)),false,`${name} belongs to the shared website backend`);
}
const source=readFileSync(new URL('../storefront/src/Storefront.tsx',import.meta.url),'utf8');
assert.ok(source.includes('table: "product_availability"'),'Use a public-safe catalog invalidation signal');
assert.ok(source.includes('table: "mobile_storefront_signals"'),'Delivery/review moderation must invalidate safely');
assert.ok(source.includes('watchVisibleRecovery'),'Keep foreground recovery');
console.log('PASS shared backend ownership and realtime contracts');

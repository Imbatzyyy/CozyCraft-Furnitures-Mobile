// Run with the canonical website checkout path; never maintains a second backend.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import assert from "node:assert/strict"
const root = process.argv[2]
assert.ok(root, "Usage: node scripts/sync-assistant-pages.mjs /path/to/website")
const source = readFileSync(resolve(root, "supabase/functions/_shared/cozycraft-mobile-pages.ts"), "utf8")
const snapshot = readFileSync(new URL("../storefront/src/lib/cozycraft-mobile-pages.ts", import.meta.url), "utf8")
assert.equal(snapshot, source, "Mobile Care page snapshot differs from the canonical backend. Copy the reviewed module before releasing.")
console.log("PASS canonical mobile Care navigation snapshot matches backend")

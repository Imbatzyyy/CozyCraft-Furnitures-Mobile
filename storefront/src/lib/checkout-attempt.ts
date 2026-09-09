import { localStore } from "./browser-storage"
const STORAGE_KEY = "cozycraft-cod-attempt-v1"
let memory: { intent: string; key: string } | null = null

/** Keep the key after an ambiguous response, including an app restart. */
export function checkoutAttemptKey(intent: unknown) {
  const serialized = JSON.stringify(intent)
  try {
    const stored = localStore.getItem(STORAGE_KEY)
    if (stored) memory = JSON.parse(stored)
  } catch { /* Storage-restricted devices still retain the in-memory attempt. */ }
  if (memory?.intent === serialized) return memory.key
  memory = { intent: serialized, key: crypto.randomUUID() }
  try { localStore.setItem(STORAGE_KEY, JSON.stringify(memory)) } catch { /* best effort */ }
  return memory.key
}

export function completeCheckoutAttempt(key: string) {
  if (memory?.key !== key) return
  memory = null
  try { localStore.removeItem(STORAGE_KEY) } catch { /* best effort */ }
}

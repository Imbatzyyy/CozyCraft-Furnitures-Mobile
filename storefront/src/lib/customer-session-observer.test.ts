import { afterEach, expect, it, vi } from "vitest"
import type { Session } from "@supabase/supabase-js"
import { observeCustomerSession } from "./customer-session-observer"
afterEach(() => vi.useRealTimers())
it("ignores a stale startup response after a newer Google sign-in, and coalesces auth bursts", async () => {
  vi.useFakeTimers()
  let reply!: (v: unknown) => void, event!: (type: string, session: Session | null) => void
  const unsubscribe = vi.fn(), apply = vi.fn()
  const auth = { getSession: () => new Promise((r) => { reply = r }), onAuthStateChange: (cb: typeof event) => { event = cb; return { data: { subscription: { unsubscribe } } } } }
  const stop = observeCustomerSession(auth as never, apply)
  const signedIn = { user: { id: "google-customer" } } as Session
  for (let n = 0; n < 10; n++) event("SIGNED_IN", signedIn)
  reply({ data: { session: null }, error: null })
  await Promise.resolve(); vi.runAllTimers()
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply).toHaveBeenCalledWith(signedIn)
  stop(); expect(unsubscribe).toHaveBeenCalledOnce()
})
it("never applies work after the route unmounts", async () => {
  vi.useFakeTimers()
  let reply!: (v: unknown) => void
  const apply = vi.fn()
  const auth = { getSession: () => new Promise((r) => { reply = r }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) }
  const stop = observeCustomerSession(auth as never, apply)
  stop(); reply({ data: { session: { user: { id: "old" } } }, error: null })
  await Promise.resolve(); vi.runAllTimers()
  expect(apply).not.toHaveBeenCalled()
})

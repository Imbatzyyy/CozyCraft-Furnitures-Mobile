import type { Session, SupabaseClient } from "@supabase/supabase-js"

// A delayed startup snapshot must never overwrite a newer sign-in/sign-out.
// Defer application work until Auth has released its session lock.
export function observeCustomerSession(auth: Pick<SupabaseClient["auth"], "getSession" | "onAuthStateChange">, apply: (session: Session | null) => void) {
  let live = true
  let revision = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (session: Session | null) => {
    clearTimeout(timer)
    timer = setTimeout(() => { if (live) apply(session) }, 0)
  }
  const { data } = auth.onAuthStateChange((_event, session) => { revision++; schedule(session) })
  void auth.getSession().then((result) => {
    if (live && revision === 0 && !result.error) schedule(result.data.session)
  }).catch(() => { /* A failed lookup is not a sign-out. Auth events can recover. */ })
  return () => { live = false; clearTimeout(timer); data.subscription.unsubscribe() }
}

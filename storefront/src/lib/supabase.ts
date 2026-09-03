import { createClient, type Session } from "@supabase/supabase-js"
import { publicSupabaseConfig } from "./public-config"

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || publicSupabaseConfig.url
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || publicSupabaseConfig.publishableKey

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing mobile Supabase configuration")
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  realtime: { params: { eventsPerSecond: 10 } },
})

export const GUEST_MODE_KEY = "cozycraft-browse-mode"

export const isGuestMode = () =>
  typeof window !== "undefined" && window.localStorage.getItem(GUEST_MODE_KEY) === "guest"

export const leaveGuestMode = () => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(GUEST_MODE_KEY)
}

const clearLocalAuthTokens = () => {
  if (typeof window === "undefined") return
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index) || ""
      if ((key.startsWith("sb-") && key.endsWith("-auth-token")) || key === "supabase.auth.token") {
        storage.removeItem(key)
      }
    }
  }
}

export async function enterGuestMode() {
  window.localStorage.setItem(GUEST_MODE_KEY, "guest")
  window.localStorage.removeItem("cozycraft-auth-intent")
  window.localStorage.removeItem("cozycraft-pending-payment")
  for (const key of ["cozycraft-saved", "cozycraft-bag", "cozycraft-orders", "cozycraft-profile"]) {
    window.localStorage.removeItem(key)
  }
  try {
    await supabase.auth.signOut({ scope: "local" })
  } finally {
    // A failed or offline sign-out must never restore an account after the
    // customer explicitly selected guest browsing.
    clearLocalAuthTokens()
  }
}

export const getSession = async (): Promise<Session | null> => {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export const mobileRedirectUrl = () =>
  window.parent !== window
    ? "com.cozycraft.furniture://auth/callback"
    : `${window.location.origin}${window.location.pathname}#/shop`

export async function verifyCustomerSession(userId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
    if (!error && data?.role) {
      if (data.role === "customer") return true
      await supabase.auth.signOut({ scope: "local" })
      return false
    }
    if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)))
  }
  await supabase.auth.signOut({ scope: "local" })
  return false
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "cozycraft-auth-callback") return
    const callback = new URL(String(event.data.url))
    const code = callback.searchParams.get("code")
    if (!code) return
    void supabase.auth.exchangeCodeForSession(code).then(async ({ data, error }) => {
      if (error || !data.user) return
      if (window.localStorage.getItem("cozycraft-auth-intent") === "recovery") {
        window.localStorage.removeItem("cozycraft-auth-intent")
        window.location.hash = "#/reset-password"
        return
      }
      const customer = await verifyCustomerSession(data.user.id)
      if (customer) leaveGuestMode()
      window.location.hash = customer ? "#/shop" : "#/sign-in?reason=invalid-login"
    })
  })
}

import { localStore, sessionStore } from "./browser-storage"
import { createClient, type Session } from "@supabase/supabase-js"
import { publicSupabaseConfig } from "./public-config"
import { boundedFetch } from "./request-lifecycle"
import { nativeAuthCallbackConsumer } from "./native-auth-callback"

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || publicSupabaseConfig.url
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || publicSupabaseConfig.publishableKey

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing mobile Supabase configuration")
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: boundedFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  realtime: { params: { eventsPerSecond: 10 } },
})

export const GUEST_MODE_KEY = "cozycraft-browse-mode"
const MOBILE_CUSTOMER_CACHE_OWNER_KEY = "cozycraft-customer-cache-owner"
const MOBILE_CUSTOMER_CACHE_KEYS = [
  "cozycraft-saved",
  "cozycraft-bag",
  "cozycraft-orders",
  "cozycraft-profile",
  "cozycraft-recently-viewed",
  "cozycraft-pending-payment",
  "cozycraft-last-payment-callback",
  "cozycraft-last-presented-payment-order",
  "cozycraft-storefront-return-state",
]

export const isGuestMode = () =>
  typeof window !== "undefined" && localStore.getItem(GUEST_MODE_KEY) === "guest"

export const leaveGuestMode = () => {
  if (typeof window === "undefined") return
  localStore.removeItem(GUEST_MODE_KEY)
}

export function clearMobileCustomerCache() {
  if (typeof window === "undefined") return
  MOBILE_CUSTOMER_CACHE_KEYS.forEach((key) => localStore.removeItem(key))
  localStore.removeItem(MOBILE_CUSTOMER_CACHE_OWNER_KEY)
  sessionStore.removeItem("cozycraft-profile-avatar-url-v1")
  sessionStore.removeItem("cozycraft-storefront-return-state")
}

export const mobileCustomerCacheOwner = () =>
  typeof window === "undefined" ? "" : localStore.getItem(MOBILE_CUSTOMER_CACHE_OWNER_KEY) || ""

export function rememberMobileCustomerCacheOwner(userId: string) {
  if (typeof window === "undefined" || !userId) return
  localStore.setItem(MOBILE_CUSTOMER_CACHE_OWNER_KEY, userId)
}

const clearLocalAuthTokens = () => {
  if (typeof window === "undefined") return
  for (const storage of [localStore, sessionStore]) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index) || ""
      if ((key.startsWith("sb-") && key.endsWith("-auth-token")) || key === "supabase.auth.token") {
        storage.removeItem(key)
      }
    }
  }
}

export async function enterGuestMode() {
  localStore.setItem(GUEST_MODE_KEY, "guest")
  localStore.removeItem("cozycraft-auth-intent")
  localStore.removeItem("cozycraft-pending-payment")
  clearMobileCustomerCache()
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
  // An unavailable profile is not evidence that the session was revoked.
  // Callers retain their cached read-only view and can retry verification.
  throw new Error("Account verification is temporarily unavailable. Please reconnect and try again.")
}

if (typeof window !== "undefined") {
  const consumeCallback = nativeAuthCallbackConsumer(async (callback) => {
    const { data, error } = await supabase.auth.exchangeCodeForSession(callback.searchParams.get("code")!)
    if (error || !data.user) throw error || new Error("Sign-in could not finish")
    if (localStore.getItem("cozycraft-auth-intent") === "recovery") {
      localStore.removeItem("cozycraft-auth-intent")
      window.location.hash = "#/reset-password"
      return
    }
    const customer = await verifyCustomerSession(data.user.id)
    if (customer) {
      clearMobileCustomerCache()
      leaveGuestMode()
    }
    window.location.hash = customer ? "#/shop" : "#/sign-in?reason=invalid-login"
  }, (url) => window.parent.postMessage({ type: "cozycraft-auth-callback-received", url }, "*"), () => {
    // Never repeatedly exchange a spent code or leave an unhandled rejection.
    const showFailure = () => { window.location.hash = "#/sign-in?reason=callback-failed" }
    void supabase.auth.getSession().then(({ data }) => {
      // Upgrading an older app can redeliver its already-spent stored URL.
      // Do not interrupt a customer who is already signed in to the shop.
      if (data.session && window.location.hash.startsWith("#/shop")) return
      showFailure()
    }).catch(showFailure)
  })
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "cozycraft-auth-callback") return
    consumeCallback(event.data.url)
  })
}

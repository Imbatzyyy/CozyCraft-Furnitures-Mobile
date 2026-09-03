import type { Session } from "@supabase/supabase-js"
import { supabase } from "../../lib/supabase"

const WARM_ACCESS_WINDOW_MS = 60_000
let warmAccess: { identity: string; expiresAt: number } | null = null

export function currentCustomerSecurityWarmAccess() {
  if (!warmAccess || warmAccess.expiresAt <= Date.now()) return null
  return warmAccess
}

export function rememberCustomerSecurityWarmAccess(identity: string) {
  warmAccess = { identity, expiresAt: Date.now() + WARM_ACCESS_WINDOW_MS }
}

export function clearCustomerSecurityWarmAccess() {
  warmAccess = null
}

export const authenticatorChallengeRequired = (currentLevel: string | null, nextLevel: string | null) =>
  nextLevel === "aal2" && currentLevel !== "aal2"

export const shouldRecheckAuthenticator = (event: string) =>
  ["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "MFA_CHALLENGE_VERIFIED", "USER_UPDATED"].includes(event)

export function sessionIdFromToken(token: string) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const value = JSON.parse(atob(part)).session_id
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null
  } catch { return null }
}

export async function syncMobileDeviceSession(session: Session) {
  const id = sessionIdFromToken(session.access_token)
  if (!id) return true
  const userAgent = navigator.userAgent
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  const device = ios ? "iPhone / iPad" : /Android/i.test(userAgent) ? "Android device" : "Mobile preview"
  // This ID only labels the registry call. The RPC verifies it against the
  // authenticated JWT and enforces revocation on the server.
  const { data, error } = await supabase.rpc("touch_customer_device_session", {
    p_session_id: id, p_device_label: device, p_browser_label: "CozyCraft mobile app",
  })
  // As on the website, a transient registry error must not log out a valid
  // session. Existing revocations remain protected by database policies.
  return error ? true : data !== false
}

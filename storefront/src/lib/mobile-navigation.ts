export type StorefrontReturnState = {
  tab: "account"
  scrollTop: number
  unreadNotifications: number
}

const STOREFRONT_RETURN_STATE_KEY = "cozycraft-storefront-return-state"

function browserSessionStorage() {
  return typeof window === "undefined" ? null : window.sessionStorage
}

export function rememberStorefrontReturnState(
  scrollTop: number,
  unreadNotifications = 0,
  storage: Pick<Storage, "setItem"> | null = browserSessionStorage(),
) {
  if (!storage) return
  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, Math.round(scrollTop)) : 0
  const safeUnreadNotifications = Number.isFinite(unreadNotifications)
    ? Math.max(0, Math.round(unreadNotifications))
    : 0
  try {
    storage.setItem(STOREFRONT_RETURN_STATE_KEY, JSON.stringify({
      tab: "account",
      scrollTop: safeScrollTop,
      unreadNotifications: safeUnreadNotifications,
    }))
  } catch {
    // Navigation still works when session storage is unavailable.
  }
}

export function hasStorefrontReturnState(
  storage: Pick<Storage, "getItem"> | null = browserSessionStorage(),
) {
  if (!storage) return false
  try {
    return Boolean(storage.getItem(STOREFRONT_RETURN_STATE_KEY))
  } catch {
    return false
  }
}

export function readStorefrontReturnState(
  storage: Pick<Storage, "getItem"> | null = browserSessionStorage(),
): StorefrontReturnState | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STOREFRONT_RETURN_STATE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StorefrontReturnState>
    if (value.tab !== "account") return null
    return {
      tab: "account",
      scrollTop: Number.isFinite(value.scrollTop) ? Math.max(0, Math.round(Number(value.scrollTop))) : 0,
      unreadNotifications: Number.isFinite(value.unreadNotifications)
        ? Math.max(0, Math.round(Number(value.unreadNotifications)))
        : 0,
    }
  } catch {
    return null
  }
}

export function clearStorefrontReturnState(
  storage: Pick<Storage, "removeItem"> | null = browserSessionStorage(),
) {
  if (!storage) return
  try {
    storage.removeItem(STOREFRONT_RETURN_STATE_KEY)
  } catch {
    // A stale return hint is harmless when session storage is unavailable.
  }
}

export function notificationBadgeCount(
  liveUnreadNotifications: number,
  notificationsHydrated: boolean,
  returnState: StorefrontReturnState | null,
) {
  const liveCount = Number.isFinite(liveUnreadNotifications)
    ? Math.max(0, Math.round(liveUnreadNotifications))
    : 0
  return notificationsHydrated ? liveCount : returnState?.unreadNotifications ?? liveCount
}

export const isMobileContentDocumentRoute = (route: string) =>
  ["#/terms", "#/privacy-policy", "#/about", "#/contact"].includes(route)

export function mobileShellBackAction(route: string, hasReturnState: boolean) {
  if (route === "#/shop") return "storefront" as const
  if (isMobileContentDocumentRoute(route)) return hasReturnState ? "history" as const : "welcome" as const
  if (["#/sign-in", "#/create-account", "#/reset-password"].includes(route)) return "welcome" as const
  return "unhandled" as const
}

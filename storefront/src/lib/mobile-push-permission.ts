export type MobilePushPermission = "unknown" | "granted" | "denied" | "unsupported"

export const MOBILE_PUSH_PERMISSION_STORAGE_KEY = "cozycraft-native-push-permission"

type PermissionStorage = Pick<Storage, "getItem" | "setItem">

export function normalizeMobilePushPermission(value: unknown): MobilePushPermission {
  return value === "granted" || value === "denied" || value === "unsupported"
    ? value
    : "unknown"
}

export function readMobilePushPermission(
  storage: PermissionStorage | null = typeof window === "undefined" ? null : window.localStorage,
): MobilePushPermission {
  if (!storage) return "unknown"
  try {
    return normalizeMobilePushPermission(storage.getItem(MOBILE_PUSH_PERMISSION_STORAGE_KEY))
  } catch {
    return "unknown"
  }
}

export function saveMobilePushPermission(
  permission: MobilePushPermission,
  storage: PermissionStorage | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return
  try {
    storage.setItem(MOBILE_PUSH_PERMISSION_STORAGE_KEY, permission)
  } catch {
    // The operating-system permission remains authoritative even when a
    // private browsing context prevents this display-state cache.
  }
}

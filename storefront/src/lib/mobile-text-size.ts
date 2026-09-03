export const MOBILE_TEXT_SIZE_OPTIONS = [
  { id: "standard", label: "Standard", scale: 1, note: "Original size" },
  { id: "comfortable", label: "Comfortable", scale: 1.15, note: "Recommended" },
  { id: "large", label: "Large", scale: 1.25, note: "Easier reading" },
  { id: "extra-large", label: "Extra large", scale: 1.4, note: "Maximum clarity" },
] as const

export type MobileTextSize = typeof MOBILE_TEXT_SIZE_OPTIONS[number]["id"]

export const DEFAULT_MOBILE_TEXT_SIZE: MobileTextSize = "comfortable"
export const MOBILE_TEXT_SIZE_STORAGE_KEY = "cozycraft-mobile-text-size-v1"

function browserLocalStorage() {
  return typeof window === "undefined" ? null : window.localStorage
}

export function isMobileTextSize(value: unknown): value is MobileTextSize {
  return MOBILE_TEXT_SIZE_OPTIONS.some((option) => option.id === value)
}

export function readMobileTextSize(
  storage: Pick<Storage, "getItem"> | null = browserLocalStorage(),
): MobileTextSize {
  if (!storage) return DEFAULT_MOBILE_TEXT_SIZE
  try {
    const saved = storage.getItem(MOBILE_TEXT_SIZE_STORAGE_KEY)
    return isMobileTextSize(saved) ? saved : DEFAULT_MOBILE_TEXT_SIZE
  } catch {
    return DEFAULT_MOBILE_TEXT_SIZE
  }
}

export function mobileTextSizeScale(size: MobileTextSize) {
  return MOBILE_TEXT_SIZE_OPTIONS.find((option) => option.id === size)?.scale
    ?? MOBILE_TEXT_SIZE_OPTIONS.find((option) => option.id === DEFAULT_MOBILE_TEXT_SIZE)!.scale
}

export function applyMobileTextSize(
  size: MobileTextSize,
  root: Pick<HTMLElement, "dataset" | "style"> | null = typeof document === "undefined" ? null : document.documentElement,
) {
  if (!root) return
  root.dataset.cozyTextSize = size
  root.style.setProperty("--cozy-font-scale", String(mobileTextSizeScale(size)))
}

export function saveMobileTextSize(
  size: MobileTextSize,
  storage: Pick<Storage, "setItem"> | null = browserLocalStorage(),
) {
  applyMobileTextSize(size)
  if (!storage) return
  try {
    storage.setItem(MOBILE_TEXT_SIZE_STORAGE_KEY, size)
  } catch {
    // The selected size still applies for this session when storage is restricted.
  }
}

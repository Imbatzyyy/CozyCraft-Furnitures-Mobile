import { localStore } from "./browser-storage"

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
const product = (value: unknown) => record(value)
  && typeof value.id === "string" && typeof value.name === "string"
  && typeof value.price === "string" && typeof value.image === "string"
const cartLine = (value: unknown) => record(value) && product(value.product)
  && typeof value.quantity === "number" && Number.isInteger(value.quantity) && value.quantity > 0

/** Old, partial or corrupt device caches are hints, never authoritative data. */
export function readCachedValue<T>(key: string, fallback: T, storage: Pick<Storage, "getItem"> = localStore): T {
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(fallback)) {
      if (!Array.isArray(value)) return fallback
      const valid = key === "cozycraft-bag" ? value.every(cartLine)
        : key === "cozycraft-orders" ? value.every(order => record(order)
          && typeof order.id === "string" && typeof order.createdAt === "string"
          && typeof order.total === "number" && Array.isArray(order.items) && order.items.every(cartLine))
        : key === "cozycraft-offline-catalog-v1" ? value.every(product)
        : ["cozycraft-saved", "cozycraft-recently-viewed", "cozycraft-mobile-compare"].includes(key) ? value.every(id => typeof id === "string")
        : value.every(record)
      return valid ? value as T : fallback
    }
    if (record(fallback)) {
      if (!record(value)) return fallback
      // Merge newly introduced fields from defaults, but reject incompatible
      // old values such as a string where profile/settings expects an object.
      for (const [field, initial] of Object.entries(fallback)) {
        if (value[field] === undefined || initial === null) continue
        if (typeof value[field] !== typeof initial || (record(initial) && !record(value[field]))) return fallback
      }
      return { ...fallback, ...value } as T
    }
    return typeof value === typeof fallback ? value as T : fallback
  } catch { return fallback }
}

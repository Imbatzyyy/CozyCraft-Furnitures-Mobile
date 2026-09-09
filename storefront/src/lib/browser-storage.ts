/** Optional device persistence must not interrupt shopping or payment handoff.
 * Failed writes/removals take precedence over old disk values for this session.
 * Nothing here promises persistence across an app restart when storage fails.
 */
export function resilientStorage(access: () => Storage | null): Storage {
  const memory = new Map<string, string>()
  const pending = new Set<string>()
  const disk = () => { try { return access() } catch { return null } }
  const keys = () => {
    const result = new Set(memory.keys())
    try {
      const storage = disk()
      for (let i = 0; storage && i < storage.length; i++) {
        const key = storage.key(i)
        if (key !== null && (!pending.has(key) || memory.has(key))) result.add(key)
      }
    } catch { /* The in-memory keys are still available. */ }
    return [...result]
  }
  return {
    get length() { return keys().length },
    key(index) { return keys()[index] ?? null },
    getItem(key) {
      if (pending.has(key)) return memory.get(key) ?? null
      try {
        const storage = disk()
        if (storage) {
          const value = storage.getItem(key)
          if (value === null) memory.delete(key)
          else memory.set(key, value)
          return value
        }
      } catch { /* Fall back only while device storage is unavailable. */ }
      return memory.get(key) ?? null
    },
    setItem(key, value) {
      memory.set(key, String(value))
      pending.add(key)
      try {
        const storage = disk()
        if (storage) { storage.setItem(key, String(value)); pending.delete(key) }
      } catch { /* Quota/private-mode failures keep the session value. */ }
    },
    removeItem(key) {
      memory.delete(key)
      pending.add(key)
      try {
        const storage = disk()
        if (storage) { storage.removeItem(key); pending.delete(key) }
      } catch { /* A deleted value must not resurrect from an old cache. */ }
    },
    clear() { for (const key of keys()) this.removeItem(key) },
  }
}

export const localStore = resilientStorage(() => typeof window === "undefined" ? null : window.localStorage)
export const sessionStore = resilientStorage(() => typeof window === "undefined" ? null : window.sessionStorage)

export function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null)
}

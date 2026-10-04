/** Serializes full/delta reads so an older full response cannot erase a newer event. */
export function createCatalogCache<T extends { id: string; updatedAt?: string }>(
  read: (ids?: string[]) => Promise<T[]>,
  manifest: () => Promise<Array<{ id: string; updated_at: string }>>,
) {
  let snapshot: T[] | null = null
  let checkedAt = 0
  let pending: Promise<T[]> | null = null
  let tail: Promise<unknown> = Promise.resolve()
  const serialize = (task: () => Promise<T[]>) => {
    const next = tail.then(task, task)
    tail = next.catch(() => {})
    return next
  }
  return {
    load(ids?: string[], force = false): Promise<T[]> {
      if (ids) return serialize(async () => {
        const rows = ids.length ? await read([...new Set(ids)]) : []
        if (snapshot) {
          const byId = new Map(rows.map(row => [row.id, row]))
          snapshot = [...snapshot.filter(row => !ids.includes(row.id)), ...byId.values()]
        }
        return rows
      })
      if (pending) return pending
      if (!force && snapshot && Date.now() - checkedAt < 30_000) return Promise.resolve(snapshot)
      pending = serialize(async () => {
        if (!snapshot) snapshot = await read()
        else {
          const versions = await manifest()
          const previous = new Map(snapshot.map(row => [row.id, row]))
          const changed = versions.filter(row => previous.get(row.id)?.updatedAt !== row.updated_at).map(row => row.id)
          const updates: T[] = []
          for (let start = 0; start < changed.length; start += 50) updates.push(...await read(changed.slice(start, start + 50)))
          const byId = new Map(updates.map(row => [row.id, row]))
          snapshot = versions.flatMap(row => {
            const value = byId.get(row.id) || (!changed.includes(row.id) ? previous.get(row.id) : undefined)
            return value ? [value] : []
          })
        }
        checkedAt = Date.now()
        return snapshot
      }).finally(() => { pending = null })
      return pending
    },
  }
}

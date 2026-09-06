/** Explicit pages prevent the server's default row cap silently truncating data. */
export async function readAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 200): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const result = await page(from, from + size - 1)
    if (result.error) throw result.error
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < size) return rows
  }
}

/** One request per burst; changes during the request trigger one trailing pass. */
export function coalescedRefresh(task: () => Promise<void>, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let dirty = false
  let disposed = false
  const run = async () => {
    if (disposed || running) return
    running = true
    dirty = false
    try { await task() } finally {
      running = false
      if (dirty && !disposed) timer = setTimeout(() => void run(), delay)
    }
  }
  return {
    request() {
      dirty = true
      if (running || disposed) return
      clearTimeout(timer)
      timer = setTimeout(() => void run(), delay)
    },
    dispose() { disposed = true; clearTimeout(timer) },
  }
}

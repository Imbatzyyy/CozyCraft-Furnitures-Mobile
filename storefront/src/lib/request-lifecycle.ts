/** A deadline also settles transports that ignore AbortSignal (older WebViews). */
export function withDeadline<T>(request: PromiseLike<T>, milliseconds = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    Promise.resolve(request),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("The connection took too long. Please try again.")), milliseconds)
    }),
  ]).finally(() => clearTimeout(timer))
}

export async function boundedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController()
  const upstream = init.signal || (input instanceof Request ? input.signal : undefined)
  const abort = () => controller.abort(upstream?.reason)
  if (upstream?.aborted) abort()
  else upstream?.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    return await withDeadline(fetch(input, { ...init, signal: controller.signal }), 26_000)
  } finally {
    clearTimeout(timer)
    upstream?.removeEventListener("abort", abort)
  }
}

/** Serialize changes to a resource without poisoning its queue after a failure. */
export class MutationQueue {
  private tail: Promise<unknown> = Promise.resolve()
  pending = 0
  run<T>(task: () => Promise<T>): Promise<T> {
    this.pending += 1
    const result = this.tail.then(task)
    this.tail = result.catch(() => undefined).finally(() => { this.pending -= 1 })
    return result
  }
}

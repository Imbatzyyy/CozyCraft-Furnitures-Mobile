import { afterEach, describe, expect, it, vi } from "vitest"
import { MutationQueue, withDeadline } from "./request-lifecycle"
import { coalescedRefresh, readAllPages } from "./paged-query"
import { checkoutAttemptKey, completeCheckoutAttempt } from "./checkout-attempt"

afterEach(() => vi.useRealTimers())
describe("request lifecycle", () => {
  it("settles a transport that ignores cancellation", async () => {
    vi.useFakeTimers()
    const pending = withDeadline(new Promise(() => {}), 100)
    const assertion = expect(pending).rejects.toThrow("connection took too long")
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it("clears the deadline after success", async () => {
    vi.useFakeTimers()
    await expect(withDeadline(Promise.resolve(42))).resolves.toBe(42)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("serializes writes and recovers after a failed write", async () => {
    const queue = new MutationQueue()
    const events: string[] = []
    let release!: () => void
    const first = queue.run(async () => { events.push("first"); await new Promise<void>((resolve) => { release = resolve }); throw new Error("offline") })
    const failed = first.catch(() => events.push("failed"))
    const second = queue.run(async () => { events.push("second") })
    await Promise.resolve()
    expect(events).toEqual(["first"])
    release()
    await Promise.all([failed, second])
    expect(events).toEqual(["first", "failed", "second"])
  })
  it("coalesces an event burst and disposes scheduled work", async () => {
    vi.useFakeTimers()
    const task = vi.fn(async () => {})
    const refresh = coalescedRefresh(task)
    refresh.request(); refresh.request(); refresh.request()
    await vi.advanceTimersByTimeAsync(250)
    expect(task).toHaveBeenCalledTimes(1)
    refresh.request(); refresh.dispose()
    await vi.advanceTimersByTimeAsync(250)
    expect(task).toHaveBeenCalledTimes(1)
  })
  it("reads beyond a full API page without dropping the last row", async () => {
    const page = vi.fn(async (from: number) => ({ data: [1, 2, 3].slice(from, from + 2), error: null }))
    await expect(readAllPages(page, 2)).resolves.toEqual([1, 2, 3])
    expect(page).toHaveBeenNthCalledWith(2, 2, 3)
  })
  it("retains checkout identity on retry and rotates only on completion or changed intent", () => {
    const first = checkoutAttemptKey({ userId: "a", quantity: 1 })
    expect(checkoutAttemptKey({ userId: "a", quantity: 1 })).toBe(first)
    expect(checkoutAttemptKey({ userId: "b", quantity: 1 })).not.toBe(first)
    const next = checkoutAttemptKey({ userId: "a", quantity: 1 })
    completeCheckoutAttempt(next)
    expect(checkoutAttemptKey({ userId: "a", quantity: 1 })).not.toBe(next)
  })
})

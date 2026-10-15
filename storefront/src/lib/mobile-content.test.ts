import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() }))
vi.mock("./supabase", () => ({ supabaseUrl: "https://test.invalid", supabase: { from: mocks.from } }))
const page = { slug: "contact", title: "Customer care", summary: "Here to help", body: "BUSINESS EMAIL\ncare@example.test", updated_at: "2026-10-15" }

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); window.localStorage.clear(); vi.useFakeTimers()
  const chain = { select: mocks.select, eq: mocks.eq, abortSignal: mocks.abortSignal, maybeSingle: mocks.maybeSingle }
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.abortSignal]) fn.mockReturnValue(chain)
  mocks.maybeSingle.mockResolvedValue({ data: page, error: null })
})
afterEach(() => { vi.useRealTimers() })

it("deduplicates reads and caches only the requested published fields", async () => {
  const { loadMobileContentPage } = await import("./mobile-data")
  const [a, b] = await Promise.all([loadMobileContentPage("contact"), loadMobileContentPage("CONTACT")])
  expect(a).toEqual(page); expect(b).toEqual(page)
  await loadMobileContentPage("contact")
  expect(mocks.from).toHaveBeenCalledTimes(1)
  expect(mocks.eq).toHaveBeenCalledWith("published", true)
  expect(mocks.select).toHaveBeenCalledWith("slug,eyebrow,title,summary,body,updated_at")
})

it("retains a saved public page for offline reading and allows an explicit retry", async () => {
  const { loadMobileContentPage, readMobileContentSnapshot } = await import("./mobile-data")
  await loadMobileContentPage("contact")
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("offline") })
  await expect(loadMobileContentPage("contact", true)).rejects.toThrow("offline")
  expect(readMobileContentSnapshot("contact")).toEqual(page)
  await loadMobileContentPage("contact", true)
  expect(mocks.from).toHaveBeenCalledTimes(3)
})

it("rehydrates public content across app launches without another fresh read", async () => {
  const first = await import("./mobile-data"); await first.loadMobileContentPage("contact")
  vi.resetModules()
  const second = await import("./mobile-data")
  expect(second.readMobileContentSnapshot("contact")).toEqual(page)
  await second.loadMobileContentPage("contact")
  expect(mocks.from).toHaveBeenCalledTimes(1)
})

it("expires the cache and removes content that is no longer published", async () => {
  const { loadMobileContentPage, readMobileContentSnapshot } = await import("./mobile-data")
  await loadMobileContentPage("contact")
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1)
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
  expect(await loadMobileContentPage("contact")).toBeNull()
  expect(readMobileContentSnapshot("contact")).toBeNull()
})

it("bounds a stalled request, aborts it, and permits another attempt", async () => {
  const { loadMobileContentPage } = await import("./mobile-data")
  mocks.maybeSingle.mockReturnValueOnce(new Promise(() => {}))
  const pending = expect(loadMobileContentPage("contact")).rejects.toThrow("timed out")
  await vi.advanceTimersByTimeAsync(8001); await pending
  expect(mocks.abortSignal.mock.calls[0][0].aborted).toBe(true)
  expect(await loadMobileContentPage("contact")).toEqual(page)
})

it("ignores corrupt persisted content", async () => {
  window.localStorage.setItem("cozycraft-public-content-v1:contact", '{"page":{"slug":"terms"},"at":0}')
  const { readMobileContentSnapshot } = await import("./mobile-data")
  expect(readMobileContentSnapshot("contact")).toBeNull()
})

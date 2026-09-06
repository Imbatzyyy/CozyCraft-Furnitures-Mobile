import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  abortSignal: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock("./supabase", () => ({
  supabase: { from: mocks.from },
}))

import {
  loadMobileFaq,
  MOBILE_FAQ_REQUEST_TIMEOUT_MS,
  readMobileFaqSnapshot,
} from "./mobile-data"

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() })
  mocks.abortSignal.mockReset()
  mocks.from.mockReset()
  mocks.maybeSingle.mockReset()

  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.abortSignal = mocks.abortSignal.mockImplementation(() => query)
  query.maybeSingle = mocks.maybeSingle
  mocks.from.mockReturnValue(query)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("mobile FAQ availability", () => {
  it("has useful offline answers before any network request finishes", () => {
    const page = readMobileFaqSnapshot()

    expect(page.source).toBe("offline")
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.some((item) => item.question.includes("payment"))).toBe(true)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("aborts a stalled request and resolves to offline answers instead of loading forever", async () => {
    vi.useFakeTimers()
    mocks.maybeSingle.mockReturnValue(new Promise(() => {}))

    const pagePromise = loadMobileFaq()
    await vi.advanceTimersByTimeAsync(MOBILE_FAQ_REQUEST_TIMEOUT_MS)

    await expect(pagePromise).resolves.toMatchObject({ source: "offline" })
    const signal = mocks.abortSignal.mock.calls[0]?.[0] as AbortSignal
    expect(signal.aborted).toBe(true)
  })

  it("caches a successful live response for the next support visit", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        title: "Frequently asked questions.",
        summary: "Current CozyCraft answers.",
        body: "HOW DO I PAY?\n\nChoose GCash, card, or cash on delivery during checkout.",
        updated_at: "2026-09-04T00:00:00.000Z",
      },
      error: null,
    })

    await expect(loadMobileFaq()).resolves.toMatchObject({
      source: "live",
      summary: "Current CozyCraft answers.",
    })
    expect(readMobileFaqSnapshot()).toMatchObject({
      source: "cache",
      summary: "Current CozyCraft answers.",
    })

    mocks.from.mockClear()
    await expect(loadMobileFaq()).resolves.toMatchObject({ source: "cache" })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

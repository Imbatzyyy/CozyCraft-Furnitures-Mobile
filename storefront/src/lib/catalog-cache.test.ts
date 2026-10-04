import { expect, it, vi } from "vitest"
import { createCatalogCache } from "./catalog-cache"

it("shares a startup read and downloads only changed IDs on recovery", async () => {
  const read = vi.fn().mockResolvedValueOnce([{ id: "a", updatedAt: "1" }, { id: "b", updatedAt: "1" }])
    .mockResolvedValueOnce([{ id: "a", updatedAt: "2" }, { id: "c", updatedAt: "1" }])
  const manifest = vi.fn().mockResolvedValue([{ id: "a", updated_at: "2" }, { id: "c", updated_at: "1" }])
  const cache = createCatalogCache(read, manifest)
  expect(await Promise.all([cache.load(), cache.load()])).toHaveLength(2)
  expect(read).toHaveBeenCalledTimes(1)
  expect(await cache.load(undefined, true)).toEqual([{ id: "a", updatedAt: "2" }, { id: "c", updatedAt: "1" }])
  expect(read).toHaveBeenLastCalledWith(["a", "c"])
  await cache.load(undefined, true)
  expect(read).toHaveBeenCalledTimes(2)
})
it("serializes a realtime delta behind startup and retains it", async () => {
  let release!: (rows: Array<{id: string; updatedAt: string}>) => void
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    .mockResolvedValueOnce([{ id: "a", updatedAt: "2" }])
  const cache = createCatalogCache(read, vi.fn())
  const startup = cache.load()
  const delta = cache.load(["a"])
  await Promise.resolve()
  release([{ id: "a", updatedAt: "1" }])
  await Promise.all([startup, delta])
  expect(await cache.load()).toEqual([{ id: "a", updatedAt: "2" }])
})
it("retries failed reads and removes every product when the manifest is empty", async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([{ id: "a", updatedAt: "1" }])
  const cache = createCatalogCache(read, vi.fn().mockResolvedValue([]))
  await expect(cache.load()).rejects.toThrow("offline")
  await cache.load()
  expect(await cache.load(undefined, true)).toEqual([])
})

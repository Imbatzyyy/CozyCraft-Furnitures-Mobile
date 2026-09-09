import { describe, expect, it } from "vitest"
import { resilientStorage, storageKeys } from "./browser-storage"

describe("optional device persistence", () => {
  it("survives throwing storage getters and keeps session values", () => {
    const storage = resilientStorage(() => { throw new Error("SecurityError") })
    storage.setItem("guest", "yes")
    expect(storage.getItem("guest")).toBe("yes")
    expect(storageKeys(storage)).toEqual(["guest"])
    storage.removeItem("guest")
    expect(storage.getItem("guest")).toBeNull()
  })

  it("does not replace a failed write or removal with an old disk value", () => {
    const disk = resilientStorage(() => null)
    disk.setItem("bag", "old")
    const storage = resilientStorage(() => ({
      ...disk, get length() { return disk.length },
      setItem() { throw new Error("QuotaExceededError") },
      removeItem() { throw new Error("Denied") },
    }))
    expect(storage.getItem("bag")).toBe("old")
    storage.setItem("bag", "new")
    expect(storage.getItem("bag")).toBe("new")
    storage.removeItem("bag")
    expect(storage.getItem("bag")).toBeNull()
    expect(storageKeys(storage)).toEqual([])
  })

  it("reads external changes normally and recovers after storage becomes writable", () => {
    const disk = resilientStorage(() => null)
    let available = false
    const storage = resilientStorage(() => available ? disk : null)
    storage.setItem("size", "large")
    available = true
    expect(storage.getItem("size")).toBe("large")
    storage.setItem("size", "standard")
    expect(disk.getItem("size")).toBe("standard")
    disk.setItem("size", "comfortable")
    expect(storage.getItem("size")).toBe("comfortable")
    storage.clear()
    expect(disk.length).toBe(0)
  })
})

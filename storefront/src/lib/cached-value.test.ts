import { describe, expect, it } from "vitest"
import { readCachedValue } from "./cached-value"

describe("device cache validation", () => {
  it.each(["null", "{}", '"wrong"', "[null]", "[{}]", "broken json"])("ignores an invalid saved list: %s", raw => {
    expect(readCachedValue("cozycraft-saved", [], { getItem: () => raw })).toEqual([])
  })
  it("rejects incomplete bag snapshots before render", () => {
    expect(readCachedValue("cozycraft-bag", [], { getItem: () => '[{"quantity":1}]' })).toEqual([])
  })
  it("keeps complete cached bag lines", () => {
    const lines = [{ product: { id: "a", name: "Sofa", price: "₱100", image: "" }, quantity: 2, selected: true }]
    expect(readCachedValue("cozycraft-bag", [], { getItem: () => JSON.stringify(lines) })).toEqual(lines)
  })
  it("fills newly added profile fields and rejects incompatible values", () => {
    const defaults = { name: "Guest", username: "", phoneVerifiedAt: null }
    expect(readCachedValue("cozycraft-profile", defaults, { getItem: () => '{"name":"Alex"}' })).toEqual({ ...defaults, name: "Alex" })
    expect(readCachedValue("cozycraft-profile", defaults, { getItem: () => '{"name":null}' })).toEqual(defaults)
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ read: vi.fn(), signOut: vi.fn() }))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }),
  auth: { signOut: mocks.signOut },
}) }))
import { verifyCustomerSession } from "./supabase"
beforeEach(() => { vi.clearAllMocks() })
describe("customer session verification", () => {
  it("does not sign a valid session out when role reads are temporarily unavailable", async () => {
    vi.useFakeTimers()
    mocks.read.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } })
    const checking = verifyCustomerSession("customer-a")
    const assertion = expect(checking).rejects.toThrow("temporarily unavailable")
    await vi.runAllTimersAsync()
    await assertion
    expect(mocks.signOut).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
  it("rejects a confirmed non-customer account", async () => {
    mocks.read.mockResolvedValue({ data: { role: "admin" }, error: null })
    await expect(verifyCustomerSession("staff-a")).resolves.toBe(false)
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })
  it("accepts a verified customer without signing out", async () => {
    mocks.read.mockResolvedValue({ data: { role: "customer" }, error: null })
    await expect(verifyCustomerSession("customer-a")).resolves.toBe(true)
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})

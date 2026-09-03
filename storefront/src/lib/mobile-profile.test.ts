import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadProfile, saveProfile, type MobileCustomerProfile } from "./mobile-data"
import type { User } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), storage: vi.fn() }))
vi.mock("./supabase", () => ({ supabaseUrl: "https://test.invalid", supabase: { from: mocks.from, storage: { from: mocks.storage } } }))
const profile: MobileCustomerProfile = {
  name: "alex", username: "alex", firstName: "Alex", lastName: "Rivera", email: "alex@example.test",
  phone: "+639171234567", phoneVerifiedAt: "2026-08-28T10:00:00Z", image: "", gender: "", birth: "1995-01-02",
}
beforeEach(() => {
  const chain = { update: mocks.update, select: mocks.select, eq: mocks.eq, single: mocks.single }
  for (const fn of [mocks.from, mocks.update, mocks.select, mocks.eq]) fn.mockReturnValue(chain)
  mocks.single.mockResolvedValue({ data: { id: "customer-a" }, error: null })
})
describe("database profile contract", () => {
  it("never sends phone or verification claims in a normal profile update", async () => {
    await saveProfile("customer-a", profile)
    expect(mocks.from).toHaveBeenCalledWith("profiles")
    expect(mocks.update).toHaveBeenCalledWith({ username: "alex", full_name: "Alex Rivera", gender: "", date_of_birth: "1995-01-02" })
    expect(mocks.eq).toHaveBeenCalledWith("id", "customer-a")
    expect(mocks.select).toHaveBeenCalledWith("id")
    expect(mocks.single).toHaveBeenCalledTimes(1)
  })
  it("does not silently succeed when RLS prevents an update", async () => {
    const error = { message: "Cannot coerce the result to a single JSON object", code: "PGRST116" }
    mocks.single.mockResolvedValue({ data: null, error })
    await expect(saveProfile("customer-a", profile)).rejects.toEqual(error)
  })
  it("loads the database verification timestamp rather than inferring verification from a phone", async () => {
    const user = { id: "customer-a", email: profile.email, user_metadata: {} } as User
    mocks.single.mockResolvedValue({ data: { id: user.id, phone: profile.phone, phone_verified_at: null }, error: null })
    expect((await loadProfile(user)).phoneVerifiedAt).toBeNull()
    mocks.single.mockResolvedValue({ data: { id: user.id, phone: profile.phone, phone_verified_at: profile.phoneVerifiedAt }, error: null })
    expect(await loadProfile(user)).toMatchObject({ phone: profile.phone, phoneVerifiedAt: profile.phoneVerifiedAt })
    expect(mocks.select).not.toHaveBeenCalledWith("*")
  })
})

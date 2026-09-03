import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadProfile, saveProfile, type MobileCustomerProfile } from "./mobile-data"
import type { User } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({
  from: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(),
  storage: vi.fn(), createSignedUrl: vi.fn(),
}))
vi.mock("./supabase", () => ({ supabaseUrl: "https://test.invalid", supabase: { from: mocks.from, storage: { from: mocks.storage } } }))
const profile: MobileCustomerProfile = {
  name: "alex", username: "alex", firstName: "Alex", lastName: "Rivera", email: "alex@example.test",
  phone: "+639171234567", phoneVerifiedAt: "2026-08-28T10:00:00Z", image: "", gender: "", birth: "1995-01-02",
}
beforeEach(() => {
  window.sessionStorage.clear()
  vi.clearAllMocks()
  const chain = { update: mocks.update, select: mocks.select, eq: mocks.eq, single: mocks.single }
  for (const fn of [mocks.from, mocks.update, mocks.select, mocks.eq]) fn.mockReturnValue(chain)
  mocks.storage.mockReturnValue({ createSignedUrl: mocks.createSignedUrl })
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://test.invalid/storage/avatar-signed" }, error: null })
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
  it("reuses a valid private-avatar URL so returning to Account does not reload the picture", async () => {
    const user = { id: "customer-a", email: profile.email, user_metadata: {} } as User
    mocks.single.mockResolvedValue({
      data: { id: user.id, username: "alex", avatar_url: "customer-a/avatar.jpg" },
      error: null,
    })

    const first = await loadProfile(user)
    const returned = await loadProfile(user)

    expect(first.image).toBe("https://test.invalid/storage/avatar-signed")
    expect(returned.image).toBe(first.image)
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("customer-a/avatar.jpg", 3600)
  })
  it("resolves a fresh URL when the realtime profile row points to a new avatar", async () => {
    const user = { id: "customer-a", email: profile.email, user_metadata: {} } as User
    mocks.single
      .mockResolvedValueOnce({ data: { id: user.id, avatar_url: "customer-a/old.jpg" }, error: null })
      .mockResolvedValueOnce({ data: { id: user.id, avatar_url: "customer-a/new.jpg" }, error: null })
    mocks.createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://test.invalid/storage/old" }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: "https://test.invalid/storage/new" }, error: null })

    expect((await loadProfile(user)).image).toBe("https://test.invalid/storage/old")
    expect((await loadProfile(user)).image).toBe("https://test.invalid/storage/new")
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2)
  })
})

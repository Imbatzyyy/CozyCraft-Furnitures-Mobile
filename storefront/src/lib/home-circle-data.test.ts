import { beforeEach, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() }))
vi.mock("./supabase", () => ({ supabase: mock, supabaseUrl: "https://example.test" }))
import { loadMobileLoyalty } from "./mobile-data"

beforeEach(() => {
  vi.clearAllMocks()
  mock.from.mockReturnValue(mock)
  mock.select.mockReturnValue(mock)
  mock.eq.mockReturnValue(mock)
  mock.single.mockResolvedValue({ data: { tier: "member", points_balance: 250 }, error: null })
  mock.rpc.mockResolvedValue({ data: { tier: "member", points_balance: 250 }, error: null })
})
it("initializes through the server calculation and normalizes old-schema labels", async () => {
  expect((await loadMobileLoyalty()).tier_display_name).toBe("Cozy Nest")
  expect(mock.rpc).toHaveBeenCalledWith("get_mobile_loyalty")
  expect(mock.from).not.toHaveBeenCalled()
})
it("uses an owner-filtered read for realtime, never the writing RPC", async () => {
  expect((await loadMobileLoyalty("fixture-user")).points_balance).toBe(250)
  expect(mock.from).toHaveBeenCalledWith("mobile_loyalty_accounts")
  expect(mock.eq).toHaveBeenCalledWith("user_id", "fixture-user")
  expect(mock.rpc).not.toHaveBeenCalled()
})
it("surfaces unavailable accounts instead of inventing a balance", async () => {
  mock.single.mockResolvedValue({ data: null, error: null })
  await expect(loadMobileLoyalty("fixture-user")).rejects.toThrow("isn't available")
})

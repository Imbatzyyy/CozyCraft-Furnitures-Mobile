import { beforeEach, describe, expect, it, vi } from "vitest"
const rpc = vi.hoisted(() => vi.fn())
vi.mock("./supabase", () => ({ supabase: { rpc }, supabaseUrl: "https://example.invalid" }))
import { saveAddress, setPrimaryAddress, type MobileAddress } from "./mobile-data"

beforeEach(() => rpc.mockReset().mockResolvedValue({ data: { id: "saved-address" }, error: null }))
describe("atomic address transport", () => {
  it("saves in one transaction and returns the exact stored address", async () => {
    const address = { recipient_name: "Mary Jane Santos", is_primary: true } as MobileAddress
    expect(await saveAddress("customer", address)).toEqual({ id: "saved-address" })
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_mobile_delivery_address", { p_address: address, p_primary_only: false, p_expected_user_id: "customer" })
  })
  it("switches default in one request instead of clearing then setting", async () => {
    await setPrimaryAddress("customer", "saved-address")
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_mobile_delivery_address", { p_address: { id: "saved-address" }, p_primary_only: true, p_expected_user_id: "customer" })
  })
  it("unwraps the table-valued PostgREST response to the exact saved row", async () => {
    const saved = { id: "new-address", recipient_name: "Mary Jane Santos", is_primary: true }
    rpc.mockResolvedValue({ data: [saved], error: null })
    expect(await saveAddress("customer", saved as MobileAddress)).toEqual(saved)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it.each([null, [], {}, { id: "" }])("rejects an unconfirmed save response (%j) without a second write", async data => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(saveAddress("customer", {} as MobileAddress)).rejects.toThrow("could not be confirmed")
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it("surfaces errors without a second partial write", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("Rejected") })
    await expect(setPrimaryAddress("customer", "missing")).rejects.toThrow("Rejected")
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it("does not send an anonymous address change", async () => {
    await expect(setPrimaryAddress("", "address")).rejects.toThrow("Sign in")
    expect(rpc).not.toHaveBeenCalled()
  })
})

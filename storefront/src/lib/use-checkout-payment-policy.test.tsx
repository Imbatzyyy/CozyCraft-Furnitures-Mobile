import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("./supabase", () => ({ supabase: { rpc: mocks.rpc } }))
import { useCheckoutPaymentPolicy } from "./use-checkout-payment-policy"

beforeEach(() => mocks.rpc.mockReset())
it("loads one small policy snapshot and does not refetch on rerenders", async () => {
  mocks.rpc.mockResolvedValue({ data: {cod_limit:20000,outstanding_cod_total:4500}, error:null })
  const {result,rerender} = renderHook(() => useCheckoutPaymentPolicy("customer"))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.outstandingCod).toBe(4500)
  rerender(); rerender()
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).toHaveBeenCalledWith("get_checkout_payment_policy")
})
it("fails closed for COD and supports an explicit retry", async () => {
  mocks.rpc.mockResolvedValueOnce({data:null,error:new Error("offline")})
    .mockResolvedValueOnce({data:{cod_limit:20000,outstanding_cod_total:0},error:null})
  const {result} = renderHook(() => useCheckoutPaymentPolicy("customer"))
  await waitFor(() => expect(result.current.error).toContain("Retry"))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toBe("")
  expect(mocks.rpc).toHaveBeenCalledTimes(2)
})
it("ignores an old customer's delayed response after the account changes", async () => {
  let resolve!: (value: unknown) => void
  mocks.rpc.mockReturnValueOnce(new Promise(done => {resolve=done}))
    .mockResolvedValueOnce({data:{cod_limit:20000,outstanding_cod_total:0},error:null})
  const {result,rerender} = renderHook(({user}) => useCheckoutPaymentPolicy(user),{initialProps:{user:"first"}})
  rerender({user:"second"})
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => resolve({data:{cod_limit:20000,outstanding_cod_total:19000},error:null}))
  expect(result.current.owner).toBe("second")
  expect(result.current.outstandingCod).toBe(0)
})
it("never asks for an unauthenticated user's policy", () => {
  renderHook(() => useCheckoutPaymentPolicy(null))
  expect(mocks.rpc).not.toHaveBeenCalled()
})

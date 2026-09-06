import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock("./supabase", () => ({
  supabaseUrl: "https://example.supabase.co",
  supabase: {
    from: mocks.from,
    functions: { invoke: mocks.invoke },
    rpc: mocks.rpc,
  },
}))

import { placeOrder, type MobileProduct } from "./mobile-data"

const addressId = "99bdb728-40a8-4575-ac91-31228449c349"
const checkoutKey = "30cfb521-9c92-4b8a-8dc7-b1cf8b663648"
const authorizationId = "22a0851f-a10f-4e42-b16d-963f558701aa"
const product: MobileProduct = {
  id: "EKOLSUND",
  name: "EKOLSUND",
  category: "Living room",
  price: "₱12,999",
  image: "/chair.jpg",
  alt: "Purple armchair",
}

beforeEach(() => {
  const addressQuery: Record<string, unknown> = {}
  addressQuery.select = vi.fn(() => addressQuery)
  addressQuery.eq = vi.fn(() => addressQuery)
  addressQuery.single = vi.fn(async () => ({ data: { id: addressId }, error: null }))
  mocks.from.mockReset().mockReturnValue(addressQuery)
  mocks.invoke.mockReset()
  mocks.rpc.mockReset()
  Object.defineProperty(window, "Capacitor", {
    configurable: true,
    value: { isNativePlatform: () => true, getPlatform: () => "ios" },
  })
})

describe("mobile checkout request", () => {
  it("keeps the exact OTP authorization, reward, products, and native return details in PayMongo handoff", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        orderId: "4c4df87d-5bc1-491f-8db7-2f88f91ea490",
        orderNumber: "CC-01042",
        checkoutUrl: "https://checkout.paymongo.com/example-session",
      },
      error: null,
    })
    mocks.rpc.mockResolvedValue({ data: true, error: null })

    await expect(placeOrder({
      userId: "8150a7d9-8f0c-49fd-8816-35b18a399a6a",
      payment: "GCash",
      items: [{ product, quantity: 2 }],
      redemptionId: "576cab56-8818-49e6-9ee8-6891e6e93166",
      addressId,
      checkoutKey,
      paymentAuthorizationId: authorizationId,
    })).resolves.toMatchObject({
      checkoutUrl: "https://checkout.paymongo.com/example-session",
      order: { id: "4c4df87d-5bc1-491f-8db7-2f88f91ea490", order_number: "CC-01042" },
    })

    expect(mocks.invoke).toHaveBeenCalledWith("create-paymongo-checkout", {
      body: {
        addressId,
        paymentMethod: "gcash",
        checkoutKey,
        mobileReturn: true,
        mobilePlatform: "ios",
        returnOrigin: window.location.origin,
        items: [{ product_id: "EKOLSUND", quantity: 2 }],
        redemptionId: "576cab56-8818-49e6-9ee8-6891e6e93166",
        paymentAuthorizationId: authorizationId,
      },
      headers: { "x-cozycraft-platform": "mobile" },
    })
    expect(mocks.rpc).toHaveBeenCalledWith("mark_mobile_order", {
      p_order_id: "4c4df87d-5bc1-491f-8db7-2f88f91ea490",
    })
  })

  it("never opens online checkout without its email authorization", async () => {
    await expect(placeOrder({
      userId: "8150a7d9-8f0c-49fd-8816-35b18a399a6a",
      payment: "Credit or debit card",
      items: [{ product, quantity: 1 }],
      addressId,
      checkoutKey,
    })).rejects.toThrow("Verify the payment code")
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it("keeps cash on delivery direct and applies the selected reward without requesting OTP", async () => {
    const orderId = "4c4df87d-5bc1-491f-8db7-2f88f91ea490"
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "place_mobile_cod_order") return { data: { id: orderId }, error: null }
      return { data: true, error: null }
    })

    await expect(placeOrder({
      userId: "8150a7d9-8f0c-49fd-8816-35b18a399a6a",
      payment: "Cash on delivery",
      items: [{ product, quantity: 1 }],
      redemptionId: "576cab56-8818-49e6-9ee8-6891e6e93166",
      addressId,
      checkoutKey,
    })).resolves.toEqual({ order: { id: orderId }, checkoutUrl: null })

    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "place_mobile_cod_order", {
      p_address_id: addressId,
      p_items: [{ product_id: "EKOLSUND", quantity: 1 }],
      p_checkout_key: checkoutKey,
      p_redemption_id: "576cab56-8818-49e6-9ee8-6891e6e93166",
    })
  })
})

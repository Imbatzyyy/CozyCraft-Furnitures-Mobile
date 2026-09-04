import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadReviews, submitReview } from "./mobile-data"

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock("./supabase", () => ({
  supabaseUrl: "https://test.invalid",
  supabase: {
    auth: { getSession: mocks.getSession },
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    order: mocks.order,
  }
  mocks.from.mockReturnValue(query)
  mocks.select.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.order.mockResolvedValue({ data: [], error: null })
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "customer-a" } } },
    error: null,
  })
})

describe("automatic review publishing", () => {
  it("accepts a verified review only when the RPC confirms it is public", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ id: "review-a", rating: 5, body: "Excellent piece", image_urls: [], approved: true }],
      error: null,
    })

    await expect(submitReview("customer-a", 41, 5, "Excellent piece")).resolves.toMatchObject({
      id: "review-a",
      approved: true,
    })
    expect(mocks.rpc).toHaveBeenCalledWith("submit_order_item_review", {
      p_order_item_id: 41,
      p_rating: 5,
      p_title: "",
      p_body: "Excellent piece",
      p_image_urls: [],
    })
  })

  it("does not present a hidden review as successfully published", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ id: "review-hidden", rating: 4, body: "Good piece", image_urls: [], approved: false }],
      error: null,
    })

    await expect(submitReview("customer-a", 42, 4, "Good piece")).rejects.toThrow(
      "not visible on the product page",
    )
  })

  it("loads only storefront-visible reviews for the public product feed", async () => {
    await loadReviews("product-a")

    expect(mocks.from).toHaveBeenCalledWith("reviews")
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "product_id", "product-a")
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "approved", true)
  })
})

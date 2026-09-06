import { describe, expect, it } from "vitest"
import { preserveMobileCartOrder } from "./mobile-cart-order"

const line = (id: string, selected: boolean) => ({ product: { id }, selected })

describe("preserveMobileCartOrder", () => {
  it("keeps the customer's visible order when the server returns rows differently", () => {
    const current = [line("sofa", true), line("lamp", false), line("table", true)]
    const refreshed = [line("table", false), line("sofa", false), line("lamp", true)]

    expect(preserveMobileCartOrder(current, refreshed)).toEqual([
      line("sofa", false),
      line("lamp", true),
      line("table", false),
    ])
  })

  it("appends a newly added product after existing lines", () => {
    const current = [line("sofa", true), line("lamp", false)]
    const refreshed = [line("new-chair", true), line("lamp", false), line("sofa", true)]

    expect(preserveMobileCartOrder(current, refreshed).map(({ product }) => product.id)).toEqual([
      "sofa", "lamp", "new-chair",
    ])
  })

  it("keeps a single existing line in place when a second line is added", () => {
    const current = [line("sofa", true)]
    const refreshed = [line("new-chair", true), line("sofa", true)]

    expect(preserveMobileCartOrder(current, refreshed).map(({ product }) => product.id)).toEqual([
      "sofa", "new-chair",
    ])
  })
})

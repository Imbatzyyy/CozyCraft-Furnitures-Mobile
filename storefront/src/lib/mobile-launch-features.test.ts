import { describe, expect, it } from "vitest"
import {
  expandMobileCatalogQuery,
  submitMobileReturnRequest,
  type MobileSearchSynonym,
} from "./mobile-data"

describe("mobile catalog discovery", () => {
  const synonyms: MobileSearchSynonym[] = [
    { term: "sofa", synonyms: ["couch", "settee"] },
    { term: "cabinet", synonyms: ["storage", "cupboard"] },
  ]

  it("expands a customer term to its configured alternatives", () => {
    expect(expandMobileCatalogQuery("Couch", synonyms)).toEqual(
      expect.arrayContaining(["couch", "sofa", "settee"]),
    )
  })

  it("keeps an unknown search useful instead of returning no terms", () => {
    expect(expandMobileCatalogQuery("reading chair", synonyms)).toEqual(["reading chair"])
  })
})

describe("mobile return evidence", () => {
  it("rejects more than two photos before any upload starts", async () => {
    const photo = new File([new Uint8Array([1, 2, 3])], "evidence.jpg", { type: "image/jpeg" })
    await expect(submitMobileReturnRequest({
      userId: "customer-id",
      orderId: "order-id",
      reason: "Damaged on arrival",
      details: "There is visible damage on the delivered item.",
      evidence: [photo, photo, photo],
    })).rejects.toThrow("up to 2 return photos")
  })
})

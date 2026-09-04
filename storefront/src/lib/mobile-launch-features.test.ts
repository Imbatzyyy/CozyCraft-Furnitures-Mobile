import { describe, expect, it } from "vitest"
import {
  expandMobileCatalogQuery,
  searchMobileCatalog,
  submitMobileReturnRequest,
  type MobileProduct,
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

  it("does not expand an unfinished fragment into products with different initials", () => {
    expect(expandMobileCatalogQuery("Cou", synonyms)).toEqual(["cou"])
    expect(expandMobileCatalogQuery("S", synonyms)).toEqual(["s"])
  })

  const products: MobileProduct[] = [
    {
      id: "mira",
      name: "Mira Cloud Sofa",
      category: "Living Room",
      subcategory: "Sofas",
      price: "₱31,500",
      image: "mira.jpg",
      alt: "Mira Cloud Sofa",
      description: "A soft upholstered seat for relaxed evenings.",
      room: "living",
    },
    {
      id: "sola",
      name: "Sola Lounge Chair",
      category: "Living Room",
      subcategory: "Lounge Chairs",
      price: "₱12,800",
      image: "sola.jpg",
      alt: "Sola Lounge Chair",
      description: "A sculptural chair with an oak frame.",
      room: "living",
    },
    {
      id: "araw",
      name: "Araw Oak Table",
      category: "Dining",
      subcategory: "Dining Tables",
      price: "₱18,900",
      image: "araw.jpg",
      alt: "Araw Oak Table",
      description: "A warm table for everyday gatherings.",
      room: "dining",
      materials: [{ type: "Solid oak", description: "Natural matte finish" }],
    },
    {
      id: "arc",
      name: "Arc Atelier Lamp",
      category: "Lighting",
      subcategory: "Table Lamps",
      price: "₱3,250",
      image: "arc.jpg",
      alt: "Arc Atelier Lamp",
      description: "Focused bedside lighting.",
      room: "bedroom",
    },
    {
      id: "tala",
      name: "Tala Accent Cabinet",
      category: "Living Room",
      subcategory: "Storage",
      price: "₱14,200",
      image: "tala.jpg",
      alt: "Tala Accent Cabinet",
      description: "A calm storage piece with warm details.",
      room: "living",
    },
    {
      id: "fjallbo",
      name: "FJÄLLBO",
      category: "Living Room",
      subcategory: "TV Stands",
      price: "₱18,999",
      image: "fjallbo.jpg",
      alt: "FJÄLLBO",
      description: "An industrial media console.",
      room: "living",
    },
  ]

  it("returns only the exact product when the complete name is searched", () => {
    const productWithLongerName: MobileProduct = {
      ...products[0],
      id: "mira-bed",
      name: "Mira Cloud Sofa Bed",
      alt: "Mira Cloud Sofa Bed",
    }
    const result = searchMobileCatalog([...products, productWithLongerName], "  Mira Cloud Sofa  ", synonyms)
    expect(result.mode).toBe("exact")
    expect(result.items.map((product) => product.id)).toEqual(["mira"])
  })

  it("matches exact names without requiring accents or matching letter case", () => {
    const result = searchMobileCatalog(products, "fjallbo", synonyms)
    expect(result.mode).toBe("exact")
    expect(result.items.map((product) => product.id)).toEqual(["fjallbo"])
  })

  it("limits one-letter suggestions to product names with the same initial", () => {
    const result = searchMobileCatalog(products, "A", synonyms)
    expect(result.mode).toBe("name")
    expect(result.items.map((product) => product.id)).toEqual(["araw", "arc"])
    expect(result.items.map((product) => product.id)).not.toContain("tala")
  })

  it("keeps a leading-name match ahead of incidental later words", () => {
    const result = searchMobileCatalog(products, "Ta", synonyms)
    expect(result.items.map((product) => product.id)).toEqual(["tala"])
    expect(result.items.map((product) => product.id)).not.toContain("araw")
  })

  it("supports full product initials when no literal name prefix exists", () => {
    const result = searchMobileCatalog(products, "MCS", synonyms)
    expect(result.mode).toBe("name")
    expect(result.items.map((product) => product.id)).toEqual(["mira"])
  })

  it("uses category and material matching only after stronger name matches", () => {
    expect(searchMobileCatalog(products, "Dining", synonyms).items.map((product) => product.id)).toEqual(["araw"])
    expect(searchMobileCatalog(products, "Solid oak", synonyms).items.map((product) => product.id)).toEqual(["araw"])
  })

  it("uses complete synonyms while preserving incomplete-prefix suggestions", () => {
    expect(searchMobileCatalog(products, "couch", synonyms).items.map((product) => product.id)).toEqual(["mira"])
    expect(searchMobileCatalog(products, "cou", synonyms)).toMatchObject({ mode: "none", items: [] })
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

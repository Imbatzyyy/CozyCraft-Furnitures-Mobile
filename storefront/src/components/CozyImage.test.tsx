import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import CozyImage from "./CozyImage"
import { productImageSources } from "../lib/responsive-image"
const source = "https://gwjsivqksyimuabbdyqq.supabase.co/storage/v1/object/public/product-images/chair.jpg"
it("selects responsive public product media and falls back once to the original", () => {
  render(<CozyImage src={source} alt="Chair" crossOrigin="anonymous"/>)
  const image = screen.getByAltText("Chair")
  expect(image.getAttribute("srcset")).toContain("1440w")
  expect(image.getAttribute("crossorigin")).toBeNull()
  fireEvent.error(image)
  expect(image.getAttribute("src")).toBe(source)
  expect(image.getAttribute("srcset")).toBeNull()
  expect(image.getAttribute("crossorigin")).toBe("anonymous")
  fireEvent.error(image)
  expect(image.getAttribute("src")).toBe(source)
})
it.each([
  source + "?token=private", source + "#private", source.replace("product-images", "avatars"),
  source.replace("product-images", "review-images"), source.replace("gwjsivqksyimuabbdyqq.supabase.co", "example.com"),
  source.replace("chair.jpg", "%2e%2e/avatars/me.jpg"),
])("does not proxy private/untrusted media: %s", value => { expect(productImageSources(value)).toBeNull() })

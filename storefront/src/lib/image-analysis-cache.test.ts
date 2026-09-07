import { expect, it } from "vitest"
import { readImageAnalysis, saveImageAnalysis } from "./image-analysis-cache"
it("retains both classifications without keeping an unbounded catalog cache", () => {
  saveImageAnalysis("first", true)
  saveImageAnalysis("second", false)
  expect(readImageAnalysis("first")).toBe(true)
  expect(readImageAnalysis("second")).toBe(false)
  for (let i = 0; i < 200; i++) saveImageAnalysis(`photo-${i}`, true)
  expect(readImageAnalysis("first")).toBeUndefined()
  expect(readImageAnalysis("second")).toBeUndefined()
  expect(readImageAnalysis("photo-199")).toBe(true)
})

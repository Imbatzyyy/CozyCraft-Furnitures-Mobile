import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import CozyCompanion from "./CozyCompanion"
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it("renders the selected supplied pose and plays one optional greeting", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }))
  render(<CozyCompanion pose="heart" />)
  expect(screen.getByRole("img").getAttribute("src")).toBe("./mascot/heart.png")
  const button = screen.getByRole("button", { name: /Say hello/ })
  fireEvent.click(button)
  expect(button.className).toContain("is-playing")
  fireEvent.animationEnd(button)
  expect(button.className).not.toContain("is-playing")
})
it("respects reduced motion and removes failed decorative artwork", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  render(<CozyCompanion pose="sleep" compact />)
  const button = screen.getByRole("button", { name: /Say hello/ })
  fireEvent.click(button)
  expect(button.className).not.toContain("is-playing")
  fireEvent.error(screen.getByRole("img"))
  expect(screen.queryByRole("button")).toBeNull()
})

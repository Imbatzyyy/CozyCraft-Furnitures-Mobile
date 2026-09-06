import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ReviewPhotoViewer from "./ReviewPhotoViewer"

describe("ReviewPhotoViewer", () => {
  it("navigates photos inside the app and closes with Escape", () => {
    const close = vi.fn()
    render(<ReviewPhotoViewer photos={["/first.jpg", "/second.jpg"]} initialIndex={0} description="A customer's chair" close={close}/>)
    expect(screen.getByRole("img").getAttribute("src")).toBe("/first.jpg")
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }))
    expect(screen.getByRole("img").getAttribute("src")).toBe("/second.jpg")
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" })
    expect(screen.getByRole("img").getAttribute("src")).toBe("/first.jpg")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(close).toHaveBeenCalledOnce()
  })
  it("shows a useful failed-image state and disables one-photo navigation", () => {
    render(<ReviewPhotoViewer photos={["/unavailable.jpg"]} initialIndex={0} description="Review" close={() => {}}/>)
    fireEvent.error(screen.getByRole("img"))
    expect(screen.getByRole("status").textContent).toContain("could not load")
    expect(screen.getByRole("button", { name: "Next photo" }).hasAttribute("disabled")).toBe(true)
  })
})

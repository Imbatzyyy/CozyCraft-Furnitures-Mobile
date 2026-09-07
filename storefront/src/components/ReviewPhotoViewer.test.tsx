import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ReviewPhotoViewer from "./ReviewPhotoViewer"

describe("ReviewPhotoViewer", () => {
  it("zooms from 100 to 300 percent and resets on the next photo", () => {
    render(<ReviewPhotoViewer photos={["/portrait.jpg", "/second.jpg"]} initialIndex={0} description="Review" close={() => {}}/>)
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(screen.getByText("300%")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Zoom in" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }))
    expect(screen.getByText("250%")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }))
    expect(screen.getByText("100%")).toBeTruthy()
    fireEvent.doubleClick(screen.getByRole("img"))
    expect(screen.getByText("200%")).toBeTruthy()
  })
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

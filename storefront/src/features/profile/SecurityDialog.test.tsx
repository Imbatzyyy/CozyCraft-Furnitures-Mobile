import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import SecurityDialog from "./SecurityDialog"

const content = <><h2 id="test-dialog-title">Phone verification</h2><input aria-label="Code"/><button>Continue</button></>
afterEach(() => vi.unstubAllGlobals())
describe("accessible mobile security dialog", () => {
  it("contains focus, blocks native back during a request, and dismisses once idle", () => {
    const close = vi.fn()
    const view = render(<SecurityDialog titleId="test-dialog-title" busy close={close}>{content}</SecurityDialog>)
    fireEvent.keyDown(document, { key: "Escape" })
    window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" }, source: window.parent }))
    expect(close).not.toHaveBeenCalled()
    view.rerender(<SecurityDialog titleId="test-dialog-title" busy={false} close={close}>{content}</SecurityDialog>)
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(screen.getByLabelText("Code"))
    screen.getByRole("button", { name: "Continue" }).focus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(screen.getByLabelText("Code"))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(close).toHaveBeenCalledTimes(1)
  })
  it("ignores untrusted native-back messages from other windows", () => {
    const close = vi.fn()
    render(<SecurityDialog titleId="test-dialog-title" busy={false} close={close}>{content}</SecurityDialog>)
    window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" }, source: null }))
    expect(close).not.toHaveBeenCalled()
  })
  it("follows the visible viewport when an iPhone keyboard opens and removes its listeners", () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 844 })
    vi.stubGlobal("visualViewport", viewport)
    const remove = vi.spyOn(viewport, "removeEventListener")
    const view = render(<SecurityDialog titleId="test-dialog-title" busy={false} close={() => {}}>{content}</SecurityDialog>)
    const overlay = screen.getByRole("dialog").parentElement!
    expect(overlay.style.height).toBe("844px")
    act(() => { viewport.height = 340; viewport.offsetTop = 20; viewport.dispatchEvent(new Event("resize")) })
    expect(overlay.style.height).toBe("340px")
    expect(overlay.style.top).toBe("20px")
    view.unmount()
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function))
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function))
  })
})

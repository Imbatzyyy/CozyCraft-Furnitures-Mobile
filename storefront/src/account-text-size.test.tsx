import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
vi.mock("./lib/supabase", () => ({ supabase: {
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel }, removeChannel: vi.fn(),
} }))
import { Account } from "./Storefront"
import { MOBILE_TEXT_SIZE_OPTIONS, readMobileTextSize, saveMobileTextSize } from "./lib/mobile-text-size"
import { localStore } from "./lib/browser-storage"

function Fixture({ userId = "", open = true }: { userId?: string; open?: boolean }) {
  const [initialView, setInitialView] = useState<"text-size" | null>(open ? "text-size" : null)
  const [size, setSize] = useState(readMobileTextSize)
  return <Account userId={userId} flash={vi.fn()} name="Alex" email="alex@example.test" image="" orders={[]}
    points={0} tier="member" lifetimeSpend={0} completedOrders={0} savedCount={0} bagCount={0} unreadNotificationCount={0}
    textSize={size} changeTextSize={value => { setSize(value); saveMobileTextSize(value) }} pushPermission="unsupported"
    enableNotifications={() => {}} edit={() => {}} shop={() => {}} openMembership={() => {}} reviewPublished={() => {}}
    initialView={initialView} onInitialViewHandled={() => setInitialView(null)} openAppInformation={() => {}} />
}
beforeEach(() => { localStore.removeItem("cozycraft-mobile-text-size-v1") })
it.each(["", "customer-a"])("opens text settings directly and applies all four saved sizes for user %s", userId => {
  render(<Fixture userId={userId}/>)
  expect(screen.getAllByRole("dialog", { name: "Choose your text size." })).toHaveLength(1)
  for (const option of MOBILE_TEXT_SIZE_OPTIONS) {
    const radio = screen.getByRole("radio", { name: new RegExp(`^${option.label} `) })
    fireEvent.click(radio)
    expect(radio.getAttribute("aria-checked")).toBe("true")
    expect(readMobileTextSize()).toBe(option.id)
    expect(document.documentElement.dataset.cozyTextSize).toBe(option.id)
  }
  fireEvent.click(screen.getByRole("button", { name: "Done" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(document.documentElement.classList.contains("text-size-dialog-open")).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: /Text size Extra large throughout/ }))
  expect(screen.getByRole("radio", { name: /^Extra large / }).getAttribute("aria-checked")).toBe("true")
})
it.each(["", "customer-a"])("native Back consumes only the text settings layer for user %s", userId => {
  render(<Fixture userId={userId}/>)
  const back = new Event("cozycraft-close-account-layer", { cancelable: true })
  act(() => { window.dispatchEvent(back) })
  expect(back.defaultPrevented).toBe(true)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(document.querySelector(".account-page")).not.toBeNull()
  const nextBack = new Event("cozycraft-close-account-layer", { cancelable: true })
  act(() => { window.dispatchEvent(nextBack) })
  expect(nextBack.defaultPrevented).toBe(false)
})
it("supports repeated opening, Escape, Close, backdrop, and unmount cleanup", () => {
  const view = render(<Fixture open={false}/>)
  const trigger = screen.getByRole("button", { name: /Text size Comfortable throughout/ })
  for (const close of [
    () => fireEvent.keyDown(window, { key: "Escape" }),
    () => fireEvent.click(screen.getByRole("button", { name: "Close text size settings" })),
    () => fireEvent.click(document.querySelector(".text-size-dialog")!),
  ]) {
    fireEvent.click(trigger); fireEvent.click(trigger)
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    close(); expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  }
  fireEvent.click(trigger); view.unmount()
  expect(document.documentElement.classList.contains("text-size-dialog-open")).toBe(false)
})

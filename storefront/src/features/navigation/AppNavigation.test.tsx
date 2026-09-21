import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import AppNavigation from "./AppNavigation"
import { APP_DEVELOPERS, APP_MENU_GROUPS, type AppInfoSection } from "./app-navigation-data"

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("matchMedia", () => ({ matches: false })) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function Fixture({ navigate = vi.fn() }: { navigate?: (destination: any) => void }) {
  const [page, setPage] = useState<AppInfoSection | null>(null)
  return <AppNavigation activeTab="saved" displayName="Alex Rivera" savedCount={3} bagCount={2} navigate={navigate} infoPage={page} changeInfoPage={setPage} onOpenChange={() => {}}/>
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }))
const finish = () => act(() => { vi.runOnlyPendingTimers() })

it("provides every app destination and highlights the current module", () => {
  render(<Fixture/>); open()
  expect(screen.getByRole("button", { name: /Wishlist/ }).getAttribute("aria-current")).toBe("page")
  for (const group of APP_MENU_GROUPS) for (const item of group.items) expect(screen.getByRole("button", { name: new RegExp(`^${item.label}(?: \\d+ items)?$`) })).toBeTruthy()
})
it("serializes fast taps and navigates once after the close animation", () => {
  const navigate = vi.fn(); render(<Fixture navigate={navigate}/>); open()
  fireEvent.click(screen.getByRole("button", { name: "Shop furniture" }))
  fireEvent.click(screen.getByRole("button", { name: "Home" }))
  expect(navigate).not.toHaveBeenCalled(); finish()
  expect(navigate).toHaveBeenCalledExactlyOnceWith("shop")
  expect(screen.queryByRole("dialog")).toBeNull()
})
it("retains the storefront while switching About and Developers and restores its inert state", () => {
  const { container } = render(<Fixture/>); open()
  expect(container.inert).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "About the App" })); finish()
  expect(screen.getByRole("dialog").getAttribute("aria-labelledby")).toBe("ccnav-page-label")
  fireEvent.click(screen.getByRole("button", { name: /Meet the developers/ }))
  expect(screen.getByText("Sammuel Guill Concepcion")).toBeTruthy()
  expect(screen.queryByText(/Jacob/)).toBeNull()
  expect(screen.getAllByRole("link")).toHaveLength(5)
  fireEvent.click(screen.getByRole("button", { name: "Back to shopping screen" }))
  expect(container.inert).not.toBe(true)
})
it("closes on Escape and consumes native Back before the underlying page handles it", () => {
  render(<Fixture/>); open()
  fireEvent.keyDown(document, { key: "Escape" }); finish()
  expect(screen.queryByRole("dialog")).toBeNull()
  open()
  const underlying = vi.fn(); window.addEventListener("message", underlying)
  window.dispatchEvent(new MessageEvent("message", { source: window.parent, data: { type: "cozycraft-native-back" } }))
  finish(); expect(underlying).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog")).toBeNull()
  window.removeEventListener("message", underlying)
})
it("ignores untrusted native messages and cancels pending navigation on unmount", () => {
  const navigate = vi.fn(); const view = render(<Fixture navigate={navigate}/>); open()
  window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" } }))
  finish(); expect(screen.getByRole("dialog")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Home" }))
  view.unmount(); finish(); expect(navigate).not.toHaveBeenCalled()
})
it("has exactly the approved app roster and matching email contacts", () => {
  expect(APP_DEVELOPERS.map(person => [person.name, person.contact?.label])).toEqual([
    ["Prince Balane", "qpcbalane@tip.edu.ph"], ["Joylyn Campuso", "qjccampuso@tip.edu.ph"],
    ["Sammuel Guill Concepcion", "qsgconcepcion@tip.edu.ph"], ["Angela Faith Suba", "qafcsuba@tip.edu.ph"],
    ["Hydee Mae Sumalinog", "qhmusumalinog@tip.edu.ph"],
  ])
  for (const person of APP_DEVELOPERS) expect(person.contact?.href).toBe(`mailto:${person.contact?.label}`)
})
it("uses instant dismissal for reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  render(<Fixture/>); open(); fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }))
  act(() => { vi.advanceTimersByTime(0) })
  expect(screen.queryByRole("dialog")).toBeNull()
})

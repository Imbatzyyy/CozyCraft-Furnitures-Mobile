import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import AppNavigation from "./AppNavigation"
import { APP_DEVELOPERS, APP_MENU_GROUPS, type AppInfoSection } from "./app-navigation-data"
import type { MobileCustomerProfile } from "../../lib/mobile-data"

const content = vi.hoisted(() => ({ load: vi.fn(), snapshot: vi.fn() }))
vi.mock("../../lib/mobile-data", () => ({ loadMobileContentPage: content.load, readMobileContentSnapshot: content.snapshot }))
const customer: MobileCustomerProfile = { name: "alex.rivera", username: "alex.rivera", firstName: "Alex", lastName: "Rivera", email: "alex@example.test", phone: "+639171234567", image: "", gender: "", birth: "" }

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("matchMedia", () => ({ matches: false })); content.load.mockReset().mockResolvedValue(null); content.snapshot.mockReset().mockReturnValue(null) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function Fixture({ navigate = vi.fn(), profile = customer, openProfile = vi.fn(), signIn = vi.fn(), createAccount = vi.fn() }: { navigate?: (destination: any) => void; profile?: MobileCustomerProfile | null; openProfile?: () => void; signIn?: () => void; createAccount?: () => void }) {
  const [page, setPage] = useState<AppInfoSection | null>(null)
  return <AppNavigation activeTab="saved" profile={profile} openProfile={openProfile} signIn={signIn} createAccount={createAccount} savedCount={3} bagCount={2} navigate={navigate} infoPage={page} changeInfoPage={setPage} onOpenChange={() => {}}/>
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
it.each([customer, null])("opens text size for members and guests after dismissing the drawer", profile => {
  const navigate = vi.fn(); render(<Fixture profile={profile} navigate={navigate}/>); open()
  fireEvent.click(screen.getByRole("button", { name: "Text size" }))
  fireEvent.click(screen.getByRole("button", { name: "Text size" }))
  expect(navigate).not.toHaveBeenCalled(); finish()
  expect(navigate).toHaveBeenCalledExactlyOnceWith("text-size")
  expect(screen.queryByRole("dialog")).toBeNull()
})
it("retains the storefront while switching About and Developers and restores its inert state", () => {
  const { container } = render(<Fixture/>); open()
  expect(container.inert).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "About CozyCraft" })); finish()
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
  for (const person of APP_DEVELOPERS) { expect(person.contact?.href).toBe(`mailto:${person.contact?.label}`); expect(person.description.length).toBeGreaterThan(60) }
})
it("uses instant dismissal for reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }))
  render(<Fixture/>); open(); fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }))
  act(() => { vi.advanceTimersByTime(0) })
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("shows full name and contacts, removes the old welcome block, and opens the existing profile once", () => {
  const openProfile = vi.fn(); render(<Fixture openProfile={openProfile}/>); open()
  expect(screen.getByText("Alex Rivera")).toBeTruthy()
  expect(screen.getByText(customer.email)).toBeTruthy()
  expect(screen.getByText(customer.phone)).toBeTruthy()
  expect(screen.queryByText(/thoughtfully connected|A place for/)).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: /View my profile/ }))
  fireEvent.click(screen.getByRole("button", { name: /View my profile/ }))
  finish(); expect(openProfile).toHaveBeenCalledTimes(1)
})

it("updates the open header on profile changes and removes personal information for guests", () => {
  const view = render(<Fixture/>); open()
  view.rerender(<Fixture profile={{ ...customer, firstName: "Andrea", lastName: "Santos", email: "new@example.test", phone: "", image: "/avatar.jpg" }}/>)
  expect(screen.queryByText("Alex Rivera")).toBeNull()
  expect(screen.getByText("Andrea Santos")).toBeTruthy()
  const avatar = document.querySelector<HTMLImageElement>(".ccnav-avatar img")!
  fireEvent.error(avatar)
  expect(document.querySelector(".ccnav-avatar")?.textContent).toBe("AS")
  view.rerender(<Fixture profile={null}/>)
  expect(screen.queryByText("new@example.test")).toBeNull()
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy()
})

it("provides working guest authentication actions", () => {
  const signIn = vi.fn(), createAccount = vi.fn()
  render(<Fixture profile={null} signIn={signIn} createAccount={createAccount}/>); open()
  fireEvent.click(screen.getByRole("button", { name: "Create account" })); finish()
  expect(createAccount).toHaveBeenCalledTimes(1)
  open(); fireEvent.click(screen.getByRole("button", { name: "Sign in" })); finish()
  expect(signIn).toHaveBeenCalledTimes(1)
})

it("opens company history without replacing the shopping page or fetching the shared team roster", () => {
  const navigate = vi.fn(); render(<Fixture navigate={navigate}/>); open()
  fireEvent.click(screen.getByRole("button", { name: "Company History" })); finish()
  expect(screen.getByText(/CozyCraft Furnitures began in 2026/)).toBeTruthy()
  expect(screen.queryByText(/Jacob/)).toBeNull()
  expect(navigate).not.toHaveBeenCalled(); expect(content.load).not.toHaveBeenCalled()
})

it("keeps policies usable on failure and retries without navigating or accepting consent", async () => {
  content.load.mockRejectedValueOnce(new Error("offline"))
  render(<Fixture/>); open()
  fireEvent.click(screen.getByRole("button", { name: "Terms of Service" })); finish()
  await act(async () => {})
  expect(screen.getByText("1. About these Terms")).toBeTruthy()
  expect(screen.getByText(/Showing the bundled policy/)).toBeTruthy()
  content.load.mockResolvedValueOnce({ slug: "terms", title: "Published terms", body: "LATEST RULES\nYour current terms.", summary: "Current policy", updated_at: "2026-10-15" })
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await act(async () => {})
  expect(screen.getByRole("heading", { name: "Published terms" })).toBeTruthy()
  expect(content.load).toHaveBeenLastCalledWith("terms", true)
})

it("ignores a late response after switching policies", async () => {
  let resolve: (page: any) => void = () => {}
  content.load.mockReturnValueOnce(new Promise(done => { resolve = done }))
  render(<Fixture/>); open()
  fireEvent.click(screen.getByRole("button", { name: "Terms of Service" })); finish()
  fireEvent.click(screen.getByRole("button", { name: /Read Privacy Policy/ }))
  await act(async () => { resolve({ slug: "terms", title: "Late terms", body: "Old response" }) })
  expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeTruthy()
  expect(screen.queryByText("Late terms")).toBeNull()
})

it("loads business contacts and opens the existing private support destination", async () => {
  content.load.mockResolvedValue({ slug: "contact", title: "Contact our team", body: "BUSINESS EMAIL\nhelp@example.test", summary: "Customer care" })
  const navigate = vi.fn(); render(<Fixture navigate={navigate}/>); open()
  fireEvent.click(screen.getByRole("button", { name: "Contact Us" })); finish()
  await act(async () => {})
  expect(screen.getByRole("link", { name: /Email customer care/ }).getAttribute("href")).toBe("mailto:help@example.test")
  fireEvent.click(screen.getByRole("button", { name: /Open Care & support/ }))
  expect(navigate).toHaveBeenCalledExactlyOnceWith("support")
  expect(screen.queryByRole("dialog")).toBeNull()
})

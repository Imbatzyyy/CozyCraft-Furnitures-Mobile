import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import AppNavigation from "./AppNavigation"
import { APP_DEVELOPERS, type AppInfoSection } from "./app-navigation-data"

const content = vi.hoisted(() => ({ load: vi.fn(), snapshot: vi.fn() }))
vi.mock("../../lib/mobile-data", () => ({ loadMobileContentPage: content.load, readMobileContentSnapshot: content.snapshot }))
beforeEach(() => { content.load.mockReset().mockResolvedValue(null); content.snapshot.mockReset().mockReturnValue(null) })
function Fixture({ initial = "about", navigate = vi.fn() }: { initial?: AppInfoSection; navigate?: (destination: "shop" | "support") => void }) {
  const [page, setPage] = useState<AppInfoSection | null>(null)
  return <><button onClick={() => setPage(initial)}>Account information</button><AppNavigation navigate={navigate} infoPage={page} changeInfoPage={setPage} onOpenChange={() => {}}/></>
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Account information" }))

it("renders no drawer or menu trigger before or after opening information", () => {
  render(<Fixture/>)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.queryByRole("button", { name: /navigation menu/i })).toBeNull()
  open()
  expect(screen.queryByRole("button", { name: /navigation menu/i })).toBeNull()
  expect(document.querySelector(".ccnav-drawer, .ccnav-trigger")).toBeNull()
})
it("retains shopping while switching About and Developers and restores inert state", () => {
  const { container } = render(<Fixture/>); open()
  expect(container.inert).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: /Meet the developers/ }))
  expect(screen.getByText("Jacob Christopher Cañete")).toBeTruthy()
  expect(screen.queryByText(/Sammuel/)).toBeNull()
  expect(screen.getAllByRole("link")).toHaveLength(5)
  expect(screen.getByRole("link", { name: /qjcanete02@tip.edu.ph/ }).getAttribute("href")).toBe("mailto:qjcanete02@tip.edu.ph")
  fireEvent.click(screen.getByRole("button", { name: "Back to shopping screen" }))
  expect(container.inert).not.toBe(true)
})
it("closes on Escape and consumes native Back before the underlying page", () => {
  render(<Fixture/>); open()
  fireEvent.keyDown(document, { key: "Escape" })
  expect(screen.queryByRole("dialog")).toBeNull()
  open()
  const underlying = vi.fn(); window.addEventListener("message", underlying)
  act(() => { window.dispatchEvent(new MessageEvent("message", { source: window.parent, data: { type: "cozycraft-native-back" } })) })
  expect(underlying).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog")).toBeNull()
  window.removeEventListener("message", underlying)
})
it("ignores untrusted native messages and restores body state on unmount", () => {
  const view = render(<Fixture/>); open()
  act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" } })) })
  expect(screen.getByRole("dialog")).toBeTruthy()
  expect(document.body.style.overflow).toBe("hidden")
  view.unmount()
  expect(document.body.style.overflow).not.toBe("hidden")
})
it("has Jacob's supplied email and the other four original contacts", () => {
  expect(APP_DEVELOPERS.map(person => [person.name, person.contact?.label])).toEqual([
    ["Prince Balane", "qpcbalane@tip.edu.ph"], ["Joylyn Campuso", "qjccampuso@tip.edu.ph"],
    ["Jacob Christopher Cañete", "qjcanete02@tip.edu.ph"], ["Angela Faith Suba", "qafcsuba@tip.edu.ph"],
    ["Hydee Mae Sumalinog", "qhmusumalinog@tip.edu.ph"],
  ])
  for (const person of APP_DEVELOPERS) {
    if (person.contact) expect(person.contact.href).toBe("mailto:" + person.contact.label)
    expect(person.description.length).toBeGreaterThan(60)
  }
})
it("opens company history without replacing shopping or fetching a team roster", () => {
  const navigate = vi.fn(); render(<Fixture initial="history" navigate={navigate}/>); open()
  expect(screen.getByText(/CozyCraft Furnitures began in 2026/)).toBeTruthy()
  expect(navigate).not.toHaveBeenCalled(); expect(content.load).not.toHaveBeenCalled()
})
it("keeps policies usable offline and retries without accepting consent", async () => {
  content.load.mockRejectedValueOnce(new Error("offline"))
  render(<Fixture initial="terms"/>); open()
  await act(async () => {})
  expect(screen.getByText("1. About these Terms")).toBeTruthy()
  expect(screen.getByText(/Showing the bundled policy/)).toBeTruthy()
  content.load.mockResolvedValueOnce({ slug: "terms", title: "Published terms", body: "LATEST RULES\nYour current terms.", summary: "Current policy", updated_at: "2026-10-15" })
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await act(async () => {})
  expect(screen.getByRole("heading", { name: "Published terms" })).toBeTruthy()
  expect(content.load).toHaveBeenLastCalledWith("terms", true)
})
it("ignores a late response after switching policies", async () => {
  let resolve: (page: unknown) => void = () => {}
  content.load.mockReturnValueOnce(new Promise(done => { resolve = done }))
  render(<Fixture initial="terms"/>); open()
  fireEvent.click(screen.getByRole("button", { name: /Read Privacy Policy/ }))
  await act(async () => { resolve({ slug: "terms", title: "Late terms", body: "Old response" }) })
  expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeTruthy()
  expect(screen.queryByText("Late terms")).toBeNull()
})
it("loads business contacts and opens existing support", async () => {
  content.load.mockResolvedValue({ slug: "contact", title: "Contact our team", body: "BUSINESS EMAIL\nhelp@example.test", summary: "Customer care" })
  const navigate = vi.fn(); render(<Fixture initial="contact" navigate={navigate}/>); open()
  await act(async () => {})
  expect(screen.getByRole("link", { name: /Email customer care/ }).getAttribute("href")).toBe("mailto:help@example.test")
  fireEvent.click(screen.getByRole("button", { name: /Open Care & support/ }))
  expect(navigate).toHaveBeenCalledExactlyOnceWith("support")
  expect(screen.queryByRole("dialog")).toBeNull()
})
it("returns to the collection without creating a duplicate information layer", () => {
  const navigate = vi.fn(); render(<Fixture navigate={navigate}/>); open()
  expect(screen.getAllByRole("dialog")).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: /Explore the collection/ }))
  expect(navigate).toHaveBeenCalledExactlyOnceWith("shop")
  expect(screen.queryByRole("dialog")).toBeNull()
})

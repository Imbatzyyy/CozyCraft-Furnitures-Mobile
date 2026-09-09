import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ signup: vi.fn(), resend: vi.fn(), settings: vi.fn(), settingsChanged: null as null | (() => void) }))
vi.mock("./lib/supabase", () => {
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.settings }
  const channel = { on: (_type: string, _filter: unknown, cb: () => void) => { mocks.settingsChanged = cb; return channel }, subscribe: () => channel }
  return { supabase: { from: () => query, channel: () => channel, removeChannel: vi.fn(), auth: { signUp: mocks.signup, resend: mocks.resend } }, mobileRedirectUrl: () => "cozycraft://auth", clearMobileCustomerCache: vi.fn(), leaveGuestMode: vi.fn(), isGuestMode: () => false }
})
import { CreateAccount } from "./routes"
import { clearManualSignupDraft } from "./features/auth/manual-signup-draft"
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const next = async () => {
  const button = await screen.findByRole("button", { name: /^Continue →$/ }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false))
  fireEvent.click(button)
}
async function toPassword() {
  const view = render(<MemoryRouter><CreateAccount /></MemoryRouter>)
  fill("First name", "Mary Jane"); fill("Last name", "Santos"); await next()
  fill(/Username/, "mary.home"); await next()
  fill("Email address", "MARY@example.test"); await next()
  await waitFor(() => expect(screen.getByText("At least 10 characters")).toBeTruthy())
  await waitFor(() => expect((screen.getByRole("button", { name: /Create my account/ }) as HTMLButtonElement).disabled).toBe(false))
  return view
}
describe("guided signup", () => {
  it("waits for slow settings and does not change the active step when requirements refresh", async () => {
    let resolve!: (v: unknown) => void
    mocks.settings.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    render(<MemoryRouter><CreateAccount /></MemoryRouter>)
    fill("First name", "Mary"); fill("Last name", "Santos")
    expect((screen.getByRole("button", { name: /Loading settings/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText("Reload account settings")).toBeNull()
    fireEvent.submit(screen.getByLabelText("First name").closest("form")!)
    expect(screen.getByLabelText("First name")).toBeTruthy()
    resolve({ data: { account_settings: { username_required: true } } })
    await next()
    mocks.settings.mockResolvedValue({ data: { account_settings: { username_required: false } } })
    mocks.settingsChanged?.()
    await screen.findByText(/Optional\. 3–24/)
    expect(screen.getByLabelText(/Username/)).toBeTruthy()
    await next()
    expect(screen.getByLabelText("Email address")).toBeTruthy()
  })
  it("offers retry only after settings fail and recovers without losing names", async () => {
    mocks.settings.mockRejectedValueOnce(new Error("offline"))
    render(<MemoryRouter><CreateAccount /></MemoryRouter>)
    fill("First name", "Mary"); fill("Last name", "Santos")
    fireEvent.click(await screen.findByText("Reload account settings"))
    await next()
    expect(screen.getByLabelText(/Username/)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("accepts one step per rapid click burst", async () => {
    render(<MemoryRouter><CreateAccount /></MemoryRouter>)
    fill("First name", "Mary"); fill("Last name", "Santos")
    await next()
    const button = screen.getByRole("button", { name: /^Continue →$/ })
    fill(/Username/, "mary.home")
    for (let i = 0; i < 20; i++) fireEvent.click(button)
    expect(screen.getByLabelText(/Username/)).toBeTruthy()
    await next()
    expect(screen.getByLabelText("Email address")).toBeTruthy()
  })
  it("retains non-secret fields on a route remount without retaining passwords or consent", async () => {
    const view = await toPassword()
    fill(/Create a password/, "StrongCozy1!")
    fireEvent.click(screen.getByRole("checkbox"))
    view.unmount()
    render(<MemoryRouter><CreateAccount /></MemoryRouter>)
    expect((screen.getByLabelText(/Create a password/) as HTMLInputElement).value).toBe("")
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("MARY@example.test")
  })
  it("rejects mismatched passwords without creating an account", async () => {
    await toPassword()
    fill(/Create a password/, "StrongCozy1!"); fill(/Confirm password/, "DifferentCozy1!")
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: /Create my account/ }))
    expect(screen.getByRole("alert").textContent).toContain("Passwords do not match")
    expect(mocks.signup).not.toHaveBeenCalled()
  })
  it("does not show verification success for a duplicate account", async () => {
    mocks.signup.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null })
    await toPassword()
    fill(/Create a password/, "StrongCozy1!"); fill(/Confirm password/, "StrongCozy1!")
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: /Create my account/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("already exists"))
    expect(screen.queryByText("One last step.")).toBeNull()
  })
  beforeEach(() => { clearManualSignupDraft(); mocks.settings.mockReset().mockResolvedValue({ data: { account_settings: { password_minimum_length: 10, username_required: true } } }); mocks.signup.mockReset(); mocks.resend.mockReset(); vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }) })
  it("validates a step and preserves names when going back", async () => {
    render(<MemoryRouter><CreateAccount /></MemoryRouter>)
    await next(); expect(screen.getByRole("alert").textContent).toContain("first and last")
    fill("First name", "Mary Jane"); fill("Last name", "Santos"); await next()
    await waitFor(() => expect((screen.getByRole("button", { name: /Back/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Mary Jane")
    expect(mocks.signup).not.toHaveBeenCalled()
  })
  it("sends the complete payload once and waits for email verification", async () => {
    mocks.signup.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null })
    await toPassword()
    fill(/Create a password/, "StrongCozy1!"); fill(/Confirm password/, "StrongCozy1!")
    fireEvent.click(screen.getByRole("checkbox"))
    const create = screen.getByRole("button", { name: /Create my account/ })
    fireEvent.click(create); fireEvent.click(create)
    await screen.findByText("One last step.")
    expect(mocks.signup).toHaveBeenCalledTimes(1)
    expect(mocks.signup.mock.calls[0][0]).toMatchObject({ email: "mary@example.test", options: { data: { full_name: "Mary Jane Santos", first_name: "Mary Jane", last_name: "Santos", username: "mary.home" } } })
    expect(localStorage.getItem("password")).toBeNull()
  })
  it("recovers from a failed signup without losing inputs", async () => {
    mocks.signup.mockRejectedValue(new Error("offline"))
    await toPassword()
    fill(/Create a password/, "StrongCozy1!"); fill(/Confirm password/, "StrongCozy1!")
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: /Create my account/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("try again"))
    expect((screen.getByRole("button", { name: /Create my account/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})

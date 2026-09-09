import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ signup: vi.fn(), resend: vi.fn() }))
vi.mock("./lib/supabase", () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { account_settings: { password_minimum_length: 10, username_required: true } } }) }
  const channel = { on: () => channel, subscribe: () => channel }
  return { supabase: { from: () => query, channel: () => channel, removeChannel: vi.fn(), auth: { signUp: mocks.signup, resend: mocks.resend } }, mobileRedirectUrl: () => "cozycraft://auth", clearMobileCustomerCache: vi.fn(), leaveGuestMode: vi.fn(), isGuestMode: () => false }
})
import { CreateAccount } from "./routes"
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const next = () => fireEvent.click(screen.getByRole("button", { name: /^Continue →$/ }))
async function toPassword() {
  render(<MemoryRouter><CreateAccount /></MemoryRouter>)
  fill("First name", "Mary Jane"); fill("Last name", "Santos"); next()
  fill(/Username/, "mary.home"); next()
  fill("Email address", "MARY@example.test"); next()
  await waitFor(() => expect(screen.getByText("At least 10 characters")).toBeTruthy())
}
describe("guided signup", () => {
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
  beforeEach(() => { mocks.signup.mockReset(); mocks.resend.mockReset(); vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }) })
  it("validates a step and preserves names when going back", () => {
    render(<MemoryRouter><CreateAccount /></MemoryRouter>)
    next(); expect(screen.getByRole("alert").textContent).toContain("first and last")
    fill("First name", "Mary Jane"); fill("Last name", "Santos"); next()
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

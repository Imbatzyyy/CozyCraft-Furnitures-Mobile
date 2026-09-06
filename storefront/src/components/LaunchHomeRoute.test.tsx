import { useEffect, useState, type ReactNode } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { expect, it, vi } from "vitest"

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))
vi.mock("../features/auth/CustomerSecurityGate", () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock("../Storefront", () => ({ default: ({ onReady }: { onReady: () => void }) => {
  const [count, setCount] = useState(0)
  useEffect(() => { lifecycle.mounts++; onReady(); return () => { lifecycle.unmounts++ } }, [])
  return <button onClick={() => setCount(count + 1)}>Home action {count}</button>
} }))
vi.mock("./SofaLaunchSequence", () => ({ default: ({ onComplete, homeReady }: { onComplete: () => void; homeReady: boolean }) => <button disabled={!homeReady} onClick={onComplete}>Finish sofa</button> }))

it("keeps the prepared home mounted and enables its controls after launch", async () => {
  const { CustomerHomeRoute } = await import("../routes")
  const router = createMemoryRouter([{ path: "/shop", Component: CustomerHomeRoute }], { initialEntries: [{ pathname: "/shop", state: { sofaLaunch: true } }] })
  const view = render(<RouterProvider router={router} />)
  const home = await screen.findByText("Home action 0")
  expect(home.closest("[inert]")).not.toBeNull()
  const mounts = lifecycle.mounts
  const unmounts = lifecycle.unmounts
  await waitFor(() => expect((screen.getByText("Finish sofa") as HTMLButtonElement).disabled).toBe(false))
  await act(async () => { fireEvent.click(screen.getByText("Finish sofa")) })
  expect(screen.queryByText("Finish sofa")).toBeNull()
  expect(screen.getByText("Home action 0")).toBe(home)
  expect(home.closest("[inert]")).toBeNull()
  expect(lifecycle.mounts).toBe(mounts)
  expect(lifecycle.unmounts).toBe(unmounts)
  expect(router.state.location.state).toBeNull()
  fireEvent.click(home)
  expect(screen.getByText("Home action 1")).toBeTruthy()
  view.unmount()
  router.dispose()
})

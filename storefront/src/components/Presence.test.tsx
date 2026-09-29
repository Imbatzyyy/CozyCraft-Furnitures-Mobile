import { useEffect, useState } from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import Presence, { PRESENCE_EXIT_MS } from "./Presence"

afterEach(() => vi.useRealTimers())

const lifecycle = { mounts: 0 }
function Page({ label }: { label: string }) {
  const [opened] = useState(() => ++lifecycle.mounts)
  return <section className="fixture-page" role="dialog" aria-modal="true">{label} #{opened}</section>
}

function Host({ value }: { value: string | null }) {
  return <Presence show={Boolean(value)} selector=".fixture-page">{value && <Page label={value} />}</Presence>
}

it("keeps a closing page mounted, inert and unchanged until its exit finishes", () => {
  vi.useFakeTimers()
  const view = render(<Host value="Sofa" />)
  const page = screen.getByRole("dialog")
  view.rerender(<Host value={null} />)
  expect(page.isConnected).toBe(true)
  expect(page.textContent).toBe("Sofa #1")
  expect(page.classList.contains("is-leaving")).toBe(true)
  expect(page.hasAttribute("inert")).toBe(true)
  act(() => vi.advanceTimersByTime(PRESENCE_EXIT_MS - 1))
  expect(page.isConnected).toBe(true)
  act(() => vi.advanceTimersByTime(1))
  expect(page.isConnected).toBe(false)
})

it("mounts a fresh page when reopened before the previous one finished leaving", () => {
  vi.useFakeTimers()
  lifecycle.mounts = 0
  const view = render(<Host value="Sofa" />)
  view.rerender(<Host value={null} />)
  view.rerender(<Host value="Chair" />)
  const pages = document.querySelectorAll(".fixture-page")
  expect(pages).toHaveLength(1)
  expect(pages[0].textContent).toBe("Chair #2")
  expect(pages[0].classList.contains("is-leaving")).toBe(false)
  act(() => vi.advanceTimersByTime(PRESENCE_EXIT_MS * 2))
  expect(document.querySelector(".fixture-page")?.textContent).toBe("Chair #2")
})

it("removes the page immediately when the customer prefers reduced motion", () => {
  const matchMedia = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  try {
    const view = render(<Host value="Sofa" />)
    view.rerender(<Host value={null} />)
    expect(document.querySelector(".fixture-page")).toBeNull()
  } finally {
    window.matchMedia = matchMedia
  }
})

it("never renders anything for an overlay that was never opened", () => {
  function Effects() { useEffect(() => { throw new Error("should not mount") }, []); return null }
  render(<Presence show={false} selector=".never">{false && <Effects />}</Presence>)
  expect(document.body.textContent).toBe("")
})

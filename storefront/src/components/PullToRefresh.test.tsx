import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PullToRefreshIndicator, findPullRefreshScrollContainer, pullDistanceForOffset, usePullToRefresh } from "./PullToRefresh"

function Harness({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const state = usePullToRefresh({ onRefresh })
  return <section ref={state.ref} data-testid="shell">
    <div className="lux-body" data-testid="scroll-surface">
      <button type="button">Content</button>
    </div>
    <PullToRefreshIndicator {...state}/>
  </section>
}

describe("PullToRefresh", () => {
  it("maps a downward pull to a bounded, eased distance", () => {
    expect(pullDistanceForOffset(-20)).toBe(0)
    expect(pullDistanceForOffset(4)).toBe(0)
    expect(pullDistanceForOffset(120)).toBeCloseTo(81.2, 5)
    expect(pullDistanceForOffset(1000)).toBe(96)
  })

  it("finds the active nested vertical scroll surface", () => {
    const shell = document.createElement("section")
    const surface = document.createElement("div")
    Object.defineProperty(surface, "scrollHeight", { configurable: true, value: 800 })
    Object.defineProperty(surface, "clientHeight", { configurable: true, value: 400 })
    surface.style.overflowY = "auto"
    shell.append(surface)
    const child = document.createElement("button")
    surface.append(child)
    expect(findPullRefreshScrollContainer(shell, child)).toBe(surface)
  })

  it("refreshes after the release threshold and resets the indicator", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh}/>)
    const shell = screen.getByTestId("shell")
    const surface = screen.getByTestId("scroll-surface")
    Object.defineProperty(surface, "scrollHeight", { configurable: true, value: 800 })
    Object.defineProperty(surface, "clientHeight", { configurable: true, value: 400 })
    surface.style.overflowY = "auto"
    fireEvent.touchStart(surface, { touches: [{ clientX: 100, clientY: 10 }] })
    fireEvent.touchMove(surface, { touches: [{ clientX: 101, clientY: 140 }] })
    expect(screen.getByText("Release to refresh")).toBeTruthy()
    fireEvent.touchEnd(shell)
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText("Refreshing")).toBeNull())
  })
})

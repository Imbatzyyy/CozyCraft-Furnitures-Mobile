import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import CozyLoader from "./CozyLoader"

export const PULL_TO_REFRESH_EVENT = "cozycraft-pull-refresh"

const PULL_THRESHOLD = 64
const MAX_PULL_DISTANCE = 96

type PullGesture = {
  scroller: HTMLElement
  startX: number
  startY: number
  distance: number
}

function isVerticalScrollContainer(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false
  return element.scrollHeight > element.clientHeight + 1
}

export function findPullRefreshScrollContainer(shell: HTMLElement, target: EventTarget | null) {
  let current = target instanceof HTMLElement ? target : null
  while (current && current !== shell) {
    if (isVerticalScrollContainer(current)) return current
    current = current.parentElement
  }
  return shell.querySelector<HTMLElement>(".lux-body") || shell
}

export function pullDistanceForOffset(offset: number) {
  return Math.min(MAX_PULL_DISTANCE, Math.max(0, (offset - 4) * 0.7))
}

type PullToRefreshOptions = {
  onRefresh: () => Promise<void>
  disabled?: boolean
}

type PullToRefreshState = {
  ref: RefObject<HTMLElement | null>
  pullDistance: number
  armed: boolean
  refreshing: boolean
}

export function usePullToRefresh({ onRefresh, disabled = false }: PullToRefreshOptions): PullToRefreshState {
  const ref = useRef<HTMLElement | null>(null)
  const onRefreshRef = useRef(onRefresh)
  const disabledRef = useRef(disabled)
  const refreshingRef = useRef(false)
  const gestureRef = useRef<PullGesture | null>(null)
  const mountedRef = useRef(true)
  const [pullDistance, setPullDistance] = useState(0)
  const [armed, setArmed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  onRefreshRef.current = onRefresh
  disabledRef.current = disabled
  refreshingRef.current = refreshing

  useEffect(() => {
    mountedRef.current = true
    const shell = ref.current
    if (!shell) return () => { mountedRef.current = false }

    const reset = () => {
      gestureRef.current = null
      if (!mountedRef.current) return
      setPullDistance(0)
      setArmed(false)
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (disabledRef.current || refreshingRef.current || event.touches.length !== 1) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest("input, textarea, select, [contenteditable=\"true\"]")) return
      const touch = event.touches[0]
      const scroller = findPullRefreshScrollContainer(shell, event.target)
      if (scroller.scrollTop > 1) return
      gestureRef.current = {
        scroller,
        startX: touch.clientX,
        startY: touch.clientY,
        distance: 0,
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current
      if (!gesture || disabledRef.current || refreshingRef.current || event.touches.length !== 1) return
      const touch = event.touches[0]
      const offsetX = touch.clientX - gesture.startX
      const offsetY = touch.clientY - gesture.startY
      if (offsetY <= 0 || Math.abs(offsetX) > Math.abs(offsetY) * 1.15 || gesture.scroller.scrollTop > 1) {
        reset()
        return
      }

      const distance = pullDistanceForOffset(offsetY)
      gesture.distance = distance
      if (distance <= 0) return
      if (mountedRef.current) {
        setPullDistance(distance)
        setArmed(distance >= PULL_THRESHOLD)
      }
      // Allow the browser to scroll naturally for a short pull. Once the
      // release threshold is reached, keep the indicator stable instead of
      // letting iOS rubber-banding move the page underneath it.
      if (distance >= PULL_THRESHOLD) event.preventDefault()
    }

    const handleTouchEnd = () => {
      const gesture = gestureRef.current
      if (!gesture) return
      gestureRef.current = null
      if (gesture.distance < PULL_THRESHOLD || disabledRef.current || refreshingRef.current) {
        reset()
        return
      }

      refreshingRef.current = true
      if (mountedRef.current) {
        setRefreshing(true)
        setPullDistance(PULL_THRESHOLD)
        setArmed(false)
      }
      void onRefreshRef.current()
        .catch((error) => console.warn("Pull-to-refresh could not complete", error))
        .finally(() => {
          refreshingRef.current = false
          if (!mountedRef.current) return
          setRefreshing(false)
          setPullDistance(0)
          setArmed(false)
        })
    }

    const handleTouchCancel = () => reset()
    shell.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true })
    shell.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true })
    shell.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true })
    shell.addEventListener("touchcancel", handleTouchCancel, { passive: true, capture: true })
    return () => {
      mountedRef.current = false
      shell.removeEventListener("touchstart", handleTouchStart, true)
      shell.removeEventListener("touchmove", handleTouchMove, true)
      shell.removeEventListener("touchend", handleTouchEnd, true)
      shell.removeEventListener("touchcancel", handleTouchCancel, true)
      gestureRef.current = null
    }
  }, [])

  return { ref, pullDistance, armed, refreshing }
}

export function PullToRefreshIndicator({ pullDistance, armed, refreshing }: Omit<PullToRefreshState, "ref">) {
  const visible = pullDistance > 0 || refreshing
  const offset = refreshing ? 10 : Math.max(-50, pullDistance - 58)
  const style = { transform: `translate3d(-50%, ${offset}px, 0)` } as CSSProperties
  return (
    <div
      className={`pull-refresh-indicator${visible ? " is-visible" : ""}${armed ? " is-armed" : ""}${refreshing ? " is-refreshing" : ""}`}
      style={style}
      role={visible ? "status" : undefined}
      aria-live="polite"
      aria-label={refreshing ? "Refreshing CozyCraft" : armed ? "Release to refresh" : "Pull to refresh"}
    >
      {refreshing ? <CozyLoader compact/> : <span className="material-symbols-rounded" aria-hidden="true">
        {armed ? "refresh" : "arrow_downward"}
      </span>}
      <small>{refreshing ? "Refreshing" : armed ? "Release to refresh" : "Pull to refresh"}</small>
    </div>
  )
}

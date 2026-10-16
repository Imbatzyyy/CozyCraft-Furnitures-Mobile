import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import AppInformation from "./AppInformation"
import { APP_INFO_LABELS, type AppInfoSection } from "./app-navigation-data"
import type { MobileStoreSettings } from "../../lib/mobile-data"
import "./app-navigation.css"

const focusable = 'button:not(:disabled), a[href], [tabindex="0"]'

// This separate build has no drawer or hidden menu trigger. Keep the existing
// information-page modal so Account links never remount the shopping session.
export default function AppNavigation({ storeSettings, navigate, infoPage, changeInfoPage, onOpenChange }: {
  storeSettings?: MobileStoreSettings
  navigate: (destination: "shop" | "support") => void
  infoPage: AppInfoSection | null
  changeInfoPage: (section: AppInfoSection | null) => void
  onOpenChange: (open: boolean) => void
}) {
  const layer = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const dismissRef = useRef(() => changeInfoPage(null))
  const active = infoPage !== null
  dismissRef.current = () => changeInfoPage(null)

  useLayoutEffect(() => { onOpenChange(active) }, [active, onOpenChange])
  useLayoutEffect(() => {
    if (!active || !layer.current) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== layer.current)
    const previous = siblings.map(element => ({ element, inert: element.inert, hidden: element.getAttribute("aria-hidden") }))
    layer.current.querySelector<HTMLElement>(".ccnav-page-back")?.focus({ preventScroll: true })
    previous.forEach(({ element }) => { element.inert = true; element.setAttribute("aria-hidden", "true") })
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); dismissRef.current(); return }
      if (event.key !== "Tab") return
      const dialog = layer.current?.querySelector<HTMLElement>(".ccnav-page")
      if (!dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(element => element.getClientRects().length > 0)
      const first = items[0], last = items.at(-1)
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    const nativeBack = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "cozycraft-native-back") return
      event.stopImmediatePropagation()
      dismissRef.current()
    }
    document.addEventListener("keydown", keydown, true)
    window.addEventListener("message", nativeBack, true)
    return () => {
      previous.forEach(({ element, inert, hidden }) => {
        element.inert = inert
        if (hidden === null) element.removeAttribute("aria-hidden")
        else element.setAttribute("aria-hidden", hidden)
      })
      document.body.style.overflow = overflow
      document.removeEventListener("keydown", keydown, true)
      window.removeEventListener("message", nativeBack, true)
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
    }
  }, [active])

  useLayoutEffect(() => {
    layer.current?.querySelector<HTMLElement>(".ccnav-page-back")?.focus({ preventScroll: true })
  }, [infoPage])
  useEffect(() => {
    layer.current?.querySelector(".ccnav-page-scroll")?.scrollTo?.(0, 0)
  }, [infoPage])

  if (!infoPage) return null
  return createPortal(<div className="ccnav-layer" ref={layer}>
    <section className="ccnav-page" role="dialog" aria-modal="true" aria-labelledby="ccnav-page-label" data-cozy-focus-managed>
      <header className="ccnav-page-header ccnav-page-header-no-menu">
        <button type="button" className="ccnav-page-back" onClick={() => changeInfoPage(null)} aria-label="Back to shopping screen"><span aria-hidden="true">←</span></button>
        <span id="ccnav-page-label">{APP_INFO_LABELS[infoPage]}</span>
        <span className="ccnav-header-balance" aria-hidden="true"/>
      </header>
      <div className="ccnav-page-scroll"><AppInformation key={infoPage} section={infoPage} changeSection={changeInfoPage} shop={() => { changeInfoPage(null); navigate("shop") }} storeSettings={storeSettings} support={() => { changeInfoPage(null); navigate("support") }}/></div>
    </section>
  </div>, document.body)
}

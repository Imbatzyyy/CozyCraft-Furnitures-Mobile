import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import cozyLogo from "../../imports/COZy.png"
import AppInformation from "./AppInformation"
import { APP_INFO_LABELS, APP_MENU_GROUPS, isAppInfoSection, type AppInfoSection, type AppMenuDestination } from "./app-navigation-data"
import type { MobileCustomerProfile, MobileStoreSettings } from "../../lib/mobile-data"
import "./app-navigation.css"

const focusable = 'button:not(:disabled), a[href], [tabindex="0"]'

export default function AppNavigation({ activeTab, profile, storeSettings, savedCount, bagCount, navigate, openProfile, signIn, createAccount, infoPage, changeInfoPage, onOpenChange }: {
  activeTab: string
  profile: MobileCustomerProfile | null
  storeSettings?: MobileStoreSettings
  openProfile: () => void
  signIn: () => void
  createAccount: () => void
  savedCount: number
  bagCount: number
  navigate: (destination: Exclude<AppMenuDestination, AppInfoSection>) => void
  infoPage: AppInfoSection | null
  changeInfoPage: (section: AppInfoSection | null) => void
  onOpenChange: (open: boolean) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [failedImage, setFailedImage] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const layer = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const active = menuOpen || infoPage !== null
  const dismissRef = useRef<() => void>(() => {})
  const activeSection = infoPage || activeTab

  const closeMenu = (after?: () => void) => {
    if (busy.current) return
    busy.current = true
    setClosing(true)
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const economy = ["economy", "paused"].includes(document.documentElement.dataset.cozyMotion || "")
    timer.current = setTimeout(() => {
      timer.current = null
      busy.current = false
      setClosing(false)
      setMenuOpen(false)
      after?.()
    }, reduced ? 0 : economy ? 120 : 220)
  }
  dismissRef.current = () => menuOpen ? closeMenu() : changeInfoPage(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useLayoutEffect(() => { onOpenChange(active) }, [active, onOpenChange])

  // Both app-information pages and the drawer share one modal boundary. Keeping
  // the storefront mounted preserves its cart, current tab, and scroll position.
  useLayoutEffect(() => {
    if (!active || !layer.current) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== layer.current)
    const previous = siblings.map(element => ({ element, inert: element.inert, hidden: element.getAttribute("aria-hidden") }))
    layer.current.querySelector<HTMLElement>(".ccnav-close, .ccnav-page-back")?.focus({ preventScroll: true })
    previous.forEach(({ element }) => { element.inert = true; element.setAttribute("aria-hidden", "true") })
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); dismissRef.current(); return }
      if (event.key !== "Tab") return
      const dialog = layer.current?.querySelector<HTMLElement>('.ccnav-drawer') || layer.current?.querySelector<HTMLElement>('.ccnav-page')
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
      else trigger.current?.focus({ preventScroll: true })
    }
  }, [active])

  useLayoutEffect(() => {
    const dialog = layer.current?.querySelector<HTMLElement>(menuOpen ? '.ccnav-drawer' : '.ccnav-page')
    dialog?.querySelector<HTMLElement>(menuOpen ? '.ccnav-close' : '.ccnav-page-back')?.focus({ preventScroll: true })
  }, [menuOpen, infoPage])
  useEffect(() => {
    layer.current?.querySelector('.ccnav-page-scroll')?.scrollTo?.(0, 0)
  }, [infoPage])

  const select = (destination: AppMenuDestination) => closeMenu(() => {
    if (isAppInfoSection(destination)) changeInfoPage(destination)
    else { changeInfoPage(null); navigate(destination) }
  })
  const goShopping = () => { changeInfoPage(null); navigate("shop") }
  const fullName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.name || "CozyCraft member" : "Welcome to CozyCraft"
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase()

  return <>
    <button ref={trigger} className="round-icon ccnav-trigger" type="button" aria-label="Open navigation menu" aria-expanded={menuOpen} aria-controls={menuOpen ? "ccnav-drawer" : undefined} onClick={() => setMenuOpen(true)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h11M4 17h16"/></svg>
    </button>
    {active && createPortal(<div className="ccnav-layer" ref={layer}>
      {infoPage && <section className="ccnav-page" role="dialog" aria-modal="true" aria-labelledby="ccnav-page-label" aria-hidden={menuOpen || undefined} data-cozy-focus-managed inert={menuOpen}>
        <header className="ccnav-page-header"><button type="button" className="ccnav-page-back" onClick={() => changeInfoPage(null)} aria-label="Back to shopping screen"><span aria-hidden="true">←</span></button><span id="ccnav-page-label">{APP_INFO_LABELS[infoPage]}</span><button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu" aria-expanded={menuOpen}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h11M4 17h16"/></svg></button></header>
        <div className="ccnav-page-scroll"><AppInformation key={infoPage} section={infoPage} changeSection={changeInfoPage} shop={goShopping} storeSettings={storeSettings} support={() => { changeInfoPage(null); navigate("support") }}/></div>
      </section>}
      {menuOpen && <div className={`ccnav-overlay${closing ? " is-closing" : ""}`}>
        <div className="ccnav-backdrop" aria-hidden="true" onClick={() => closeMenu()}/>
        <section id="ccnav-drawer" className="ccnav-drawer" role="dialog" aria-modal="true" aria-labelledby="ccnav-title" data-cozy-focus-managed>
          <header className="ccnav-drawer-header"><img src={cozyLogo} alt="CozyCraft Furniture" width="116" height="54"/><button type="button" className="ccnav-close" onClick={() => closeMenu()} aria-label="Close navigation menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
          <div className="ccnav-drawer-scroll">
            <section className="ccnav-profile" aria-label={profile ? "Your profile" : "Guest account"}>
              <div className="ccnav-profile-heading">
                <div className="ccnav-avatar" aria-hidden="true">{profile?.image && profile.image !== failedImage ? <img src={profile.image} alt="" width="64" height="64" decoding="async" onError={() => setFailedImage(profile.image)}/> : profile ? initials : <span className="material-symbols-rounded">person</span>}</div>
                <div><span className="ccnav-eyebrow">{profile ? "Your account" : "Make yourself at home"}</span><h2 id="ccnav-title">{fullName}</h2></div>
              </div>
              {profile ? <><div className="ccnav-profile-details">{profile.email && <p>{profile.email}</p>}{profile.phone && <p>{profile.phone}</p>}</div><button type="button" className="ccnav-profile-action" onClick={() => closeMenu(() => { changeInfoPage(null); openProfile() })}>View my profile <span aria-hidden="true">↗</span></button></> : <><p className="ccnav-guest-copy">Sign in to keep your favourites and orders together.</p><div className="ccnav-guest-actions"><button type="button" onClick={() => closeMenu(signIn)}>Sign in</button><button type="button" onClick={() => closeMenu(createAccount)}>Create account</button></div></>}
            </section>
            <nav aria-label="App navigation">{APP_MENU_GROUPS.map(group => <div className="ccnav-group" key={group.label}><h3>{group.label}</h3>{group.items.map(item => {
              const count = item.id === "saved" ? savedCount : item.id === "bag" ? bagCount : 0
              return <button type="button" key={item.id} aria-current={activeSection === item.id ? "page" : undefined} onClick={() => select(item.id)}>
                <span className="material-symbols-rounded" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{count > 0 ? <span className="ccnav-count" aria-label={`${count} items`}>{count > 99 ? "99+" : count}</span> : <span className="ccnav-chevron material-symbols-rounded" aria-hidden="true">chevron_right</span>}
              </button>
            })}</div>)}</nav>
            <footer className="ccnav-drawer-footer"><span aria-hidden="true">✦</span> Furniture for a life well lived.</footer>
          </div>
        </section>
      </div>}
    </div>, document.body)}
  </>
}

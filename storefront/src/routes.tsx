import { lazy, Suspense, useEffect, useState } from "react"
import { createHashRouter, Link, useLocation, useNavigate } from "react-router"
import CustomerSecurityGate from "./features/auth/CustomerSecurityGate"
import cozyLogo from "./imports/COZy.png"
import googleMark from "./assets/google-g.ico"
import { enterGuestMode, isGuestMode, leaveGuestMode, mobileRedirectUrl, supabase, verifyCustomerSession } from "./lib/supabase"
import { acceptCurrentMobilePolicies, loadMobileContentPage, type MobileContentPage } from "./lib/mobile-data"

const Storefront = lazy(() => import("./Storefront"))

const MOBILE_POLICY_VERSION = "2026-08-16"
const MOBILE_POLICY_PENDING_KEY = "cozycraft-mobile-policy-consent-pending"

async function finishPendingPolicyAcceptance() {
  if (window.localStorage.getItem(MOBILE_POLICY_PENDING_KEY) !== MOBILE_POLICY_VERSION) return
  await acceptCurrentMobilePolicies("mobile_signup")
  window.localStorage.removeItem(MOBILE_POLICY_PENDING_KEY)
}

function Mark() {
  return (
    <div className="auth-mark">
      <img src={cozyLogo} alt="CozyCraft Furniture" width="469" height="156" />
    </div>
  )
}

function SplashMark() {
  return (
    <div className="splash-brand" aria-label="CozyCraft Furniture">
      <div className="splash-brand-word">
        <span>C</span>
        <i aria-hidden="true" />
        <span>ZY</span>
      </div>
      <span className="splash-brand-craft">CRAFT</span>
      <span className="splash-brand-furniture">FURNITURE</span>
    </div>
  )
}
function BackLink() {
  return (
    <Link className="back-link" to="/welcome" aria-label="Back to welcome">
      ← <span>Back</span>
    </Link>
  )
}

type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

const termsSections: LegalSection[] = [
  {
    title: "1. About these Terms",
    paragraphs: [
      "These Terms of Service govern your access to and use of the CozyCraft Furnitures mobile application, website, customer account, catalog, ordering, delivery, support, reviews, and related services in the Philippines (collectively, the “Services”). By creating an account, placing an order, or continuing to use the Services, you agree to these Terms and our Privacy Policy.",
      "CozyCraft Furnitures is the online merchant for products identified as sold by CozyCraft. Business and customer-support details are available in Account › Support and on your order confirmation. If you do not agree, do not create an account or place an order.",
    ],
  },
  {
    title: "2. Eligibility and accounts",
    bullets: [
      "You must be at least 18 years old and legally able to enter into a contract, or use the Services with the involvement and consent of a parent or legal guardian.",
      "Provide accurate, current information and keep your email, phone number, delivery address, and account details updated.",
      "Keep your password, verification codes, and signed-in devices secure. Notify us through Support if you suspect unauthorized activity.",
      "You are responsible for activity performed through your account, except where caused by our failure to apply reasonable security measures.",
    ],
  },
  {
    title: "3. Products, content, and prices",
    paragraphs: [
      "We aim to display product descriptions, dimensions, materials, finishes, colors, availability, prices, promotions, and photographs accurately. Screen settings, natural materials, production batches, and handcrafted finishes may cause reasonable variation. Product measurements are approximate unless expressly stated otherwise.",
      "Prices are shown in Philippine pesos and include applicable taxes unless stated otherwise. Delivery, assembly, or other charges are disclosed before you confirm checkout. We may correct genuine typographical or pricing errors before fulfillment and will give you the choice to accept the corrected price or cancel for a refund.",
    ],
  },
  {
    title: "4. Orders and acceptance",
    paragraphs: [
      "Submitting checkout is an offer to purchase. An automated acknowledgment does not by itself mean the order has been accepted. Acceptance occurs when we confirm the order for processing or shipment. We may decline or cancel an order for unavailable stock, suspected fraud, incorrect information, delivery limitations, legal restrictions, or a genuine pricing error. If payment was collected, the appropriate refund process will be started.",
      "Inventory is shared between the app, website, and administrative system. Rare timing differences may occur when several customers purchase the final units at the same time.",
    ],
  },
  {
    title: "5. Payments",
    paragraphs: [
      "Available methods may include cash on delivery and supported electronic methods such as cards or GCash through an authorized payment provider. Electronic payment credentials are entered into the payment provider’s secure flow; CozyCraft does not request your card PIN, GCash MPIN, one-time password, or complete card security code through chat or support.",
      "A payment marked pending is not final until confirmed by the payment provider. You authorize us and our payment partners to process payment, verification, reversal, and refund information necessary to complete the transaction.",
    ],
  },
  {
    title: "6. Delivery and receiving furniture",
    bullets: [
      "Delivery estimates are good-faith estimates and may change due to inventory, weather, traffic, carrier capacity, access restrictions, force majeure, or events beyond reasonable control.",
      "Provide a complete, serviceable delivery address and disclose stairs, elevators, narrow access, subdivision rules, or other conditions relevant to safe furniture delivery.",
      "An adult authorized to receive and inspect the order must be present. Check the packaging and product promptly and report visible damage, missing parts, or an incorrect item through Support with reasonable evidence.",
      "Risk of accidental loss transfers upon completed delivery to you or your authorized recipient, without limiting rights provided by Philippine consumer law.",
    ],
  },
  {
    title: "7. Cancellations, returns, and refunds",
    paragraphs: [
      "The cancellation, return, exchange, and refund rules displayed at checkout, in your order, or in Store Policies apply together with mandatory rights under the Consumer Act of the Philippines, the Internet Transactions Act, and other applicable law. Nothing in these Terms removes a remedy that cannot legally be waived.",
      "Change-of-mind requests may be subject to the posted policy and the item’s condition. Defective, damaged, misdescribed, or incorrect goods will be handled in accordance with applicable law. Customized, made-to-order, assembled, hygiene-sensitive, or clearance items may have special conditions where legally permitted. Approved electronic-payment refunds are returned through the supported provider and may take additional banking or provider processing time.",
    ],
  },
  {
    title: "8. Reviews, support, and acceptable use",
    bullets: [
      "Reviews must reflect a genuine experience and must not contain unlawful, abusive, discriminatory, fraudulent, infringing, private, or misleading material.",
      "Do not probe security, scrape the catalog at scale, interfere with the Services, misuse promotions, impersonate another person, submit false claims, or use another customer’s account or personal data.",
      "You retain ownership of your review content, while granting CozyCraft a non-exclusive, royalty-free license to display, format, moderate, and use it to operate and promote the Services. We may remove content that violates these Terms or law.",
    ],
  },
  {
    title: "9. Intellectual property",
    paragraphs: [
      "The CozyCraft name, logo, interface, product presentation, photographs owned by CozyCraft, text, graphics, and software are protected by applicable intellectual-property laws. You may use the Services only for personal, lawful shopping. No ownership is transferred to you, and commercial reproduction or redistribution requires written permission.",
    ],
  },
  {
    title: "10. Service availability and liability",
    paragraphs: [
      "We use reasonable care to keep the Services accurate, secure, and available, but temporary maintenance, network interruption, device incompatibility, or third-party service failure may occur. To the maximum extent allowed by law, neither party is liable for indirect or unforeseeable loss. Any limitation applies only where legally permitted and does not exclude liability for fraud, willful misconduct, gross negligence, personal injury caused by negligence, or mandatory consumer rights.",
    ],
  },
  {
    title: "11. Suspension and termination",
    paragraphs: [
      "You may stop using the Services and request account deletion through Support, subject to records we must retain by law or for unresolved transactions. We may restrict or suspend access where reasonably necessary to protect customers, investigate fraud or security incidents, comply with law, or address a material breach. When appropriate, we will provide notice and a way to contact us.",
    ],
  },
  {
    title: "12. Governing law, concerns, and changes",
    paragraphs: [
      "These Terms are governed by the laws of the Republic of the Philippines. Please contact CozyCraft Support first so we can try to resolve a concern promptly. You may also exercise remedies or submit complaints to the appropriate Philippine authority, including the Department of Trade and Industry, without losing any right available by law.",
      "We may update these Terms for legal, security, operational, or service changes. Material changes will be announced in the app or by another appropriate channel before they take effect when required. Continued use after the effective date means you accept the updated Terms; where fresh consent is legally required, we will request it.",
    ],
  },
]

const privacySections: LegalSection[] = [
  {
    title: "1. Who controls your information",
    paragraphs: [
      "CozyCraft Furnitures is the personal information controller for customer information processed through the CozyCraft app and website. Privacy requests may be submitted through Account › Support or sent to privacy@cozycraftfurnitures.com. The business contact and service address shown in the app’s Store Information and your order documents form part of this notice.",
      "This notice follows the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules and Regulations, applicable National Privacy Commission issuances, and Philippine e-commerce and consumer-protection requirements.",
    ],
  },
  {
    title: "2. Information we collect",
    bullets: [
      "Account and identity data: name, username, email address, authentication identifier, profile photo, date of birth when voluntarily supplied, and Google account profile details when you choose Google sign-in.",
      "Contact and delivery data: mobile number, recipient name, address, barangay, city or municipality, province or region, postal code, landmark, and delivery instructions.",
      "Shopping and transaction data: cart, wishlist, product selections, orders, quantities, discounts, payment method and status, payment-provider references, refunds, delivery tracking, returns, and invoices. We do not intentionally store your complete card number, CVV, GCash MPIN, or payment OTP.",
      "Customer-service and community data: support tickets and replies, attachments you submit, product ratings, reviews, and moderation records.",
      "Technical and security data: device and app version, IP address, session and authentication events, timestamps, diagnostics, crash information, security logs, notification token, and consent or preference records.",
      "App permissions: only permissions needed for a feature you request, such as photos or camera access when uploading a profile image or support attachment, and notifications when you opt in. We do not need your contacts, microphone, or precise location for ordinary shopping and will not access them without a stated purpose and the permission required by your device.",
    ],
  },
  {
    title: "3. How information is collected",
    paragraphs: [
      "We receive information directly from you, automatically from your use of the Services, from your chosen sign-in or payment provider, and from delivery or support partners involved in your transaction. We may combine records across the CozyCraft app and website so your account, cart, wishlist, orders, support, and notifications remain synchronized.",
    ],
  },
  {
    title: "4. Why we process information",
    bullets: [
      "To create and secure your account, authenticate sign-ins, recover access, prevent duplicate or fraudulent accounts, and keep sessions synchronized.",
      "To provide the catalog, remember carts and wishlists, accept and fulfill orders, process or reconcile payments and refunds, arrange delivery, issue records, and provide after-sales support.",
      "To send transactional messages such as verification, password reset, order, payment, delivery, refund, support, and security notices.",
      "To personalize relevant content and improve product availability, accessibility, performance, customer experience, and service reliability using aggregated or appropriately protected information where possible.",
      "To prevent fraud, abuse, and security incidents; enforce our Terms; maintain audit records; establish or defend legal claims; and comply with tax, accounting, consumer, privacy, and other legal obligations.",
      "To send optional promotions only where permitted and according to your preferences. You can withdraw marketing consent without affecting essential service messages.",
    ],
  },
  {
    title: "5. Lawful bases",
    paragraphs: [
      "Depending on the activity, processing is necessary to perform our contract with you, take steps you request before a purchase, comply with legal obligations, protect lawful interests such as security and fraud prevention, establish or defend legal claims, or act on your freely given consent. Consent may be withdrawn at any time for future processing, but withdrawal does not invalidate earlier lawful processing or processing required on another lawful basis.",
    ],
  },
  {
    title: "6. Who receives information",
    bullets: [
      "Authorized CozyCraft personnel whose roles require access, subject to access controls and confidentiality duties.",
      "Cloud database, authentication, storage, email, monitoring, and hosting providers, including Supabase and service infrastructure supporting the app and website.",
      "Google when you choose Google authentication, and the relevant mobile operating-system provider for app functionality you enable.",
      "Payment providers such as PayMongo and their supported banks, card networks, e-wallets, anti-fraud, and settlement partners.",
      "Delivery, logistics, installation, and customer-support partners that need limited order and contact information to serve you.",
      "Professional advisers, insurers, regulators, courts, law enforcement, or other parties where disclosure is authorized or required by law, or necessary to protect rights, safety, and security.",
    ],
  },
  {
    title: "7. Cross-border processing",
    paragraphs: [
      "Some technology providers may process or store information using infrastructure outside the Philippines. Where this occurs, we remain accountable for the processing under applicable Philippine privacy law and use contractual, access-control, encryption, and other appropriate safeguards proportionate to the risk.",
    ],
  },
  {
    title: "8. Retention and deletion",
    paragraphs: [
      "We keep identifiable information only for as long as necessary for the stated purpose: account and preference records while the account is active; carts and wishlists until removed or the account is deleted; transaction, payment, invoice, refund, and delivery records for the period required by Philippine tax, accounting, consumer, anti-fraud, and legal-claims obligations; support and review records while needed to resolve the matter and maintain service integrity; and security logs for a limited risk-based period. Backups are rotated and securely overwritten according to the applicable backup cycle.",
      "When retention is no longer justified, information is deleted, anonymized, or securely disposed of. A deletion request may not immediately remove records we must preserve for an unresolved order, refund, dispute, fraud investigation, or legal obligation. We will explain an applicable exception when responding to a request.",
    ],
  },
  {
    title: "9. Security",
    paragraphs: [
      "We use reasonable and appropriate organizational, physical, and technical safeguards, including authenticated access, role-based permissions, database row-level security, encrypted network transport, restricted administrator access, secrets kept outside the client app, backups, audit logging, monitoring, and incident-response procedures. No internet service can guarantee absolute security, so protect your device and credentials and report suspicious activity promptly.",
      "If a personal-data breach creates a notification obligation, we will notify affected individuals and the National Privacy Commission in accordance with applicable requirements.",
    ],
  },
  {
    title: "10. Your rights",
    bullets: [
      "Be informed about processing and request access to personal data concerning you.",
      "Dispute inaccuracies and request correction without unreasonable delay.",
      "Object to processing or withdraw consent where the processing depends on consent.",
      "Request suspension, blocking, removal, or destruction when the legal conditions are met.",
      "Receive data portability where applicable and technically feasible.",
      "Seek indemnification for damage caused by a violation and lodge a complaint with the National Privacy Commission.",
    ],
    paragraphs: [
      "Submit a request through Account › Support or the privacy email above. We may verify identity before acting to protect your account. We will respond within the period required by applicable law and explain any lawful limitation. You may manage notification and marketing choices in Account settings, while essential transactional or security messages cannot be disabled during an active transaction.",
    ],
  },
  {
    title: "11. Children",
    paragraphs: [
      "The Services are intended for adults. We do not knowingly create independent shopping accounts for children under 18. A parent or legal guardian who believes a child provided personal data without proper involvement should contact us so we can review and take appropriate action.",
    ],
  },
  {
    title: "12. Automated processing and updates",
    paragraphs: [
      "We may use rules to detect suspicious sign-ins, payment anomalies, stock limits, or misuse. These safeguards support human review and are not intended to make a solely automated decision that produces a legal or similarly significant effect without the disclosures and rights required by law.",
      "We may update this notice when our practices, providers, security measures, or legal obligations change. The effective date and material changes will be shown in the app. Where a new purpose requires consent, we will ask before processing for that purpose.",
    ],
  },
]

function LegalDocument({ kind }: { kind: "terms" | "privacy" }) {
  const nav = useNavigate()
  const terms = kind === "terms"
  const sections = terms ? termsSections : privacySections
  const [livePage, setLivePage] = useState<MobileContentPage | null>(null)
  useEffect(() => {
    let active = true
    void loadMobileContentPage(terms ? "terms" : "privacy")
      .then((page) => { if (active) setLivePage(page) })
      .catch(() => undefined)
    return () => { active = false }
  }, [terms])
  const liveParagraphs = String(livePage?.body || "")
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  return (
    <main className="auth-phone legal-document">
      <header>
        <button type="button" onClick={() => nav(-1)} aria-label="Go back">←</button>
        <SplashMark />
        <span>{terms ? "TERMS" : "PRIVACY"}</span>
      </header>
      <article>
        <p className="eyebrow-auth">COZYCRAFT FURNITURES · PHILIPPINES</p>
        <h1>{livePage?.title || (terms ? "Terms of Service" : "Privacy Policy")}</h1>
        <p className="legal-effective">Version {MOBILE_POLICY_VERSION}{livePage?.updated_at ? ` · Updated ${new Date(livePage.updated_at).toLocaleDateString("en-PH", { dateStyle: "long" })}` : ""}</p>
        <div className="legal-summary">
          <span>{terms ? "A fair shopping agreement" : "Your data, treated with care"}</span>
          <p>
            {livePage?.summary || (terms
              ? "Clear rules for accounts, orders, payments, delivery, returns, and support across the CozyCraft app and website."
              : "A plain-language explanation of what CozyCraft collects, why it is needed, who receives it, and how you can exercise your rights.")}
          </p>
        </div>
        {liveParagraphs.length > 0 ? liveParagraphs.map((paragraph, index) => (
          <section key={`${kind}-${index}`}><p>{paragraph}</p></section>
        )) : sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
            )}
          </section>
        ))}
        <aside>
          <b>Questions or requests?</b>
          <p>Use Account › Support or email privacy@cozycraftfurnitures.com.</p>
        </aside>
      </article>
      <footer>
        <button type="button" onClick={() => nav(-1)}>Done reading</button>
      </footer>
    </main>
  )
}

function ContentDocument({ kind }: { kind: "about" | "contact" }) {
  const nav = useNavigate()
  const [page, setPage] = useState<MobileContentPage | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void loadMobileContentPage(kind)
      .then((next) => { if (active) setPage(next) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind])
  const paragraphs = String(page?.body || "")
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  return <main className="auth-phone legal-document content-document">
    <header><button type="button" onClick={() => nav(-1)} aria-label="Go back">←</button><SplashMark/><span>{kind.toUpperCase()}</span></header>
    <article>
      <p className="eyebrow-auth">{page?.eyebrow || "COZYCRAFT FURNITURES"}</p>
      <h1>{page?.title || (loading ? "Preparing this page…" : kind === "about" ? "Thoughtful furniture for real homes." : "We are here to help.")}</h1>
      <div className="legal-summary"><span>{kind === "about" ? "Our approach" : "Customer care"}</span><p>{page?.summary || "Live CozyCraft information will appear here when your connection returns."}</p></div>
      {paragraphs.map((paragraph, index) => <section key={`${kind}-${index}`}><p>{paragraph}</p></section>)}
      {kind === "contact" && <aside><b>Need help with an order?</b><p>Open Account › Care & support so your request stays private and linked to your order history.</p></aside>}
    </article>
    <footer><button type="button" onClick={() => nav(-1)}>Done</button></footer>
  </main>
}
function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  hint?: string
}) {
  const [show, setShow] = useState(false)
  const password = type === "password"
  return (
    <label className="field">
      <span>{label}</span>
      <div>
        <input
          required
          type={password && show ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  )
}
function Splash() {
  const navigate = useNavigate()
  const [destination, setDestination] = useState("/welcome")
  useEffect(() => {
    let active = true
    let timer: number | undefined
    const startedAt = Date.now()

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const nextDestination = data.session?.user && !isGuestMode() ? "/shop" : "/welcome"
      setDestination(nextDestination)
      const remaining = Math.max(0, 1850 - (Date.now() - startedAt))
      timer = window.setTimeout(() => navigate(nextDestination, { replace: true }), remaining)
    }).catch(() => {
      if (!active) return
      timer = window.setTimeout(() => navigate("/welcome", { replace: true }), 1850)
    })

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [navigate])
  return (
    <main className="auth-phone splash">
      <div className="splash-orbit orbit-one" />
      <div className="splash-orbit orbit-two" />
      <div className="splash-glass" />
      <div className="splash-content">
        <p className="splash-overline">ESTD 2026</p>
        <Mark />
        <div className="splash-rule" />
        <p className="splash-line">
          Furniture for a life
          <br />
          <em>well lived.</em>
        </p>
      </div>
      <div className="splash-footer">
        <div
          className="splash-loader"
          role="progressbar"
          aria-label="Loading CozyCraft"
        >
          <i />
        </div>
        <button onClick={() => navigate(destination, { replace: true })}>
          Enter CozyCraft <span>→</span>
        </button>
      </div>
    </main>
  )
}
function Welcome() {
  const navigate = useNavigate()
  const [enteringGuest, setEnteringGuest] = useState(false)
  const [welcomeSlide, setWelcomeSlide] = useState(0)
  const [welcomeTouchStart, setWelcomeTouchStart] = useState<number | null>(null)
  const welcomeShowcases = [
    { image: "./furniture/photo-1599696848652-f0ff23bc911f.jpg", alt: "A serene warm-toned living room with a sculptural sofa", label: "THE LIVING EDIT · 2026" },
    { image: "./furniture/photo-1600210492486-724fe5c67fb0.jpg", alt: "A calm contemporary bedroom arranged for restorative rest", label: "THE BEDROOM EDIT · 2026" },
    { image: "./furniture/photo-1617806118233-18e1de247200.jpg", alt: "A considered dining space designed for gathering", label: "THE DINING EDIT · 2026" },
  ]
  useEffect(() => {
    welcomeShowcases.forEach(({ image: source }) => {
      const image = new Image()
      image.src = source
    })
    const timer = window.setInterval(() => {
      setWelcomeSlide((current) => (current + 1) % welcomeShowcases.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])
  const moveWelcome = (direction: number) => {
    setWelcomeSlide((current) => (current + direction + welcomeShowcases.length) % welcomeShowcases.length)
  }
  const browseAsGuest = async () => {
    if (enteringGuest) return
    setEnteringGuest(true)
    try {
      await enterGuestMode()
      navigate("/shop", { replace: true })
    } finally {
      setEnteringGuest(false)
    }
  }
  return (
    <main className="auth-phone welcome">
      <div
        className="welcome-art welcome-carousel"
        onTouchStart={(event) => setWelcomeTouchStart(event.touches[0].clientX)}
        onTouchEnd={(event) => {
          if (welcomeTouchStart === null) return
          const distance = event.changedTouches[0].clientX - welcomeTouchStart
          if (Math.abs(distance) > 42) moveWelcome(distance > 0 ? -1 : 1)
          setWelcomeTouchStart(null)
        }}
      >
        <div className="welcome-slides" aria-live="polite">
          {welcomeShowcases.map((showcase, index) => (
            <img src={showcase.image} alt={showcase.alt} className={index === welcomeSlide ? "active" : ""} aria-hidden={index !== welcomeSlide} key={showcase.image} />
          ))}
        </div>
        <div className="welcome-glass-logo">
          <Mark />
          <span>{welcomeShowcases[welcomeSlide].label}</span>
        </div>
        <div className="welcome-pagination" aria-label="Welcome showcase slides">
          {welcomeShowcases.map((showcase, index) => (
            <button type="button" className={index === welcomeSlide ? "active" : ""} onClick={() => setWelcomeSlide(index)} aria-label={`Show ${showcase.label.toLowerCase()}`} aria-current={index === welcomeSlide ? "true" : undefined} key={showcase.image} />
          ))}
        </div>
        <p className="welcome-index">{String(welcomeSlide + 1).padStart(2, "0")} / {String(welcomeShowcases.length).padStart(2, "0")}</p>
      </div>
      <section className="welcome-panel">
        <p className="eyebrow-auth">FURNITURE, CONSIDERED</p>
        <h1>
          Live beautifully.
          <br />
          <em>Rest deeply.</em>
        </h1>
        <p className="intro">
          Exceptional pieces for the everyday rituals that make a house feel
          like home.
        </p>
        <div className="welcome-actions">
          <Link to="/create-account" className="auth-primary">
            CREATE ACCOUNT <b>→</b>
          </Link>
          <Link to="/sign-in" className="auth-secondary">
            I ALREADY HAVE AN ACCOUNT
          </Link>
          <button type="button" className="guest-entry" onClick={() => void browseAsGuest()} disabled={enteringGuest}>
            {enteringGuest ? "Preparing guest mode…" : "Browse as guest"} <span>→</span>
          </button>
        </div>
        <p className="legal">
          By continuing, you agree to our <Link to="/terms">Terms</Link> and{" "}
          <Link to="/privacy-policy">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  )
}
function SignIn() {
  const nav = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [notice, setNotice] = useState("")
  const [noticeKind, setNoticeKind] = useState<"error" | "success">("error")
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(true)

  useEffect(() => {
    if (new URLSearchParams(location.search).get("reason") === "invalid-login") {
      setNoticeKind("error")
      setNotice("Incorrect email or password. Please check your credentials.")
    }
  }, [location.search])

  useEffect(() => {
    let active = true
    void supabase
      .from("store_settings")
      .select("account_settings")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        const settings = data?.account_settings as Record<string, unknown> | undefined
        setGoogleEnabled(settings?.google_auth_enabled !== false)
      })
    return () => { active = false }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNoticeKind("error")
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !password) {
      setNotice("Enter your email address and password to continue.")
      return
    }
    setBusy(true)
    setNotice("")
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error || !data.user) {
      setBusy(false)
      setPassword("")
      setNotice("Incorrect email or password. Please check your credentials.")
      return
    }
    const customer = await verifyCustomerSession(data.user.id)
    if (!customer) {
      setBusy(false)
      setPassword("")
      setNotice("Incorrect email or password. Please check your credentials.")
      return
    }
    leaveGuestMode()
    await finishPendingPolicyAcceptance().catch((cause) => {
      console.warn("Policy acceptance will retry after sign-in", cause)
    })
    setBusy(false)
    nav("/shop", { replace: true })
  }

  const sendReset = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    setNoticeKind("error")
    setNotice("")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice("Enter a valid account email address.")
      return
    }
    setBusy(true)
    window.localStorage.setItem("cozycraft-auth-intent", "recovery")
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: mobileRedirectUrl(),
    })
    setBusy(false)
    if (error) {
      window.localStorage.removeItem("cozycraft-auth-intent")
      setNotice(error.message.toLowerCase().includes("rate limit")
        ? "Too many reset requests. Please wait a few minutes and try again."
        : "We could not send the reset email. Please try again shortly.")
      return
    }
    setNoticeKind("success")
    setNotice("If this email belongs to a CozyCraft account, a secure reset link is on its way.")
  }
  return (
    <main className="auth-phone form-page deluxe-signin">
      <header className="signin-top">
        <BackLink />
        <span>RETURNING MEMBER</span>
      </header>
      <section className="signin-intro">
        <Mark />
        <p className="eyebrow-auth">{forgot ? "ACCOUNT RECOVERY" : "WELCOME BACK"}</p>
        <h1>
          {forgot ? "Find your" : "Your home"}
          <br />
          <em>{forgot ? "way back." : "is waiting."}</em>
        </h1>
        <p className="intro">
          {forgot
            ? "Enter your account email and we’ll send a secure password-reset link."
            : "Sign in to return to your saved pieces, order updates, and Home Circle benefits."}
        </p>
      </section>
      <section className="signin-form-card">
        <div className="signin-security-note">
          <span>⌾</span>
          <p><b>{forgot ? "Private recovery" : "Customer account"}</b><small>{forgot ? "Reset links are time-limited and single-use." : "Protected by encrypted authentication and role verification."}</small></p>
        </div>
        <form onSubmit={forgot ? sendReset : submit} noValidate>
          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          {!forgot && <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />}
          {!forgot && <div className="form-options signin-options">
            <span>Use your CozyCraft customer account.</span>
            <button
              type="button"
              onClick={() => { setForgot(true); setPassword(""); setNotice("") }}
            >
              Forgot password?
            </button>
          </div>}
          <button className="auth-primary" type="submit" disabled={busy}>
            {busy ? (forgot ? "SENDING SECURE LINK…" : "VERIFYING ACCOUNT…") : (forgot ? "SEND RESET LINK" : "SIGN IN TO COZYCRAFT")} <b>→</b>
          </button>
          {notice && (
            <p className={`form-notice ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"}>
              {notice}
            </p>
          )}
        </form>
        {forgot ? (
          <button className="signin-back-button" type="button" onClick={() => { setForgot(false); setNotice("") }}>
            ← Return to sign in
          </button>
        ) : googleEnabled && <><div className="or">
          <span />
          or continue with
          <span />
        </div>
        <button
          className="google"
          onClick={async () => {
            leaveGuestMode()
            setNotice("")
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: mobileRedirectUrl(), skipBrowserRedirect: window.parent !== window },
            })
            if (error) {
              setNoticeKind("error")
              setNotice("Google sign-in could not be started. Please try again.")
            }
            else if (data.url && window.parent !== window) {
              window.parent.postMessage({ type: "cozycraft-open-oauth", url: data.url }, "*")
            }
          }}
        >
          <img src={googleMark} alt="" aria-hidden="true" />
          Continue with Google
        </button>
        </>}
        <p className="switch-auth">
          New here? <Link to="/create-account">Create your account</Link>
        </p>
      </section>
    </main>
  )
}

function ResetPassword() {
  const nav = useNavigate()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [notice, setNotice] = useState("")
  const [noticeKind, setNoticeKind] = useState<"error" | "success">("error")
  const [busy, setBusy] = useState(false)
  const strong = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setNoticeKind("error")
    setNotice("")
    if (!strong) {
      setNotice("Use at least 8 characters with uppercase and lowercase letters, a number, and a symbol.")
      return
    }
    if (password !== confirm) {
      setNotice("Passwords do not match. Please try again.")
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setNotice(error.message.toLowerCase().includes("session")
        ? "This reset link is invalid or has expired. Request a new link from sign in."
        : "Your password could not be updated. Please try again.")
      return
    }
    setNoticeKind("success")
    setNotice("Your password has been changed securely. You can now sign in.")
    window.setTimeout(() => {
      void supabase.auth.signOut({ scope: "local" }).finally(() => nav("/sign-in", { replace: true }))
    }, 1200)
  }

  return (
    <main className="auth-phone form-page deluxe-signin reset-password-page">
      <header className="signin-top">
        <Link className="back-link" to="/sign-in">← <span>Sign in</span></Link>
        <span>SECURE RECOVERY</span>
      </header>
      <section className="signin-intro">
        <Mark />
        <p className="eyebrow-auth">CREATE NEW PASSWORD</p>
        <h1>Choose something<br/><em>new.</em></h1>
        <p className="intro">Use a strong password you have not used for this account before.</p>
      </section>
      <section className="signin-form-card">
        <div className="signin-security-note"><span>⌾</span><p><b>Protected change</b><small>The recovery session is verified before your password is replaced.</small></p></div>
        <form onSubmit={submit} noValidate>
          <Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint="8+ characters with a number and symbol" />
          <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <button className="auth-primary" disabled={busy}>{busy ? "SAVING SECURELY…" : "SAVE NEW PASSWORD"}<b>→</b></button>
          {notice && <p className={`form-notice ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"}>{notice}</p>}
        </form>
      </section>
    </main>
  )
}

function CreateAccount() {
  const nav = useNavigate()
  const [first, setFirst] = useState("")
  const [last, setLast] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [notice, setNotice] = useState("")
  const [noticeKind, setNoticeKind] = useState<"error" | "success">("error")
  const [busy, setBusy] = useState(false)
  const [verification, setVerification] = useState(false)
  const [resending, setResending] = useState(false)
  const [passwordMinimum, setPasswordMinimum] = useState(8)
  const [usernameRequired, setUsernameRequired] = useState(true)
  const [googleEnabled, setGoogleEnabled] = useState(true)

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("account_settings")
        .eq("id", true)
        .maybeSingle()
      const settings = data?.account_settings as Record<string, unknown> | undefined
      if (!active || !settings) return
      setPasswordMinimum(Math.max(8, Number(settings.password_minimum_length) || 8))
      setUsernameRequired(settings.username_required !== false)
      setGoogleEnabled(settings.google_auth_enabled !== false)
    }
    void loadSettings()
    const channel = supabase
      .channel("mobile-registration-settings")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "store_settings" },
        loadSettings,
      )
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  const requirements = [
    password.length >= passwordMinimum,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const passwordScore = requirements.filter(Boolean).length
  const passwordStrong = requirements.every(Boolean)
  const passwordsMatch = Boolean(confirm) && password === confirm
  const strength = !password
    ? ""
    : passwordScore === requirements.length
      ? "Strong"
      : passwordScore >= 3
        ? "Fair"
        : "Weak"

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotice("")
    setNoticeKind("error")
    if (!first.trim() || !last.trim()) {
      setNotice("Enter your first and last name to continue.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setNotice("Enter a valid email address.")
      return
    }
    if (!agreed) {
      setNotice("Please agree to the Terms and Privacy Policy to continue.")
      return
    }
    if (usernameRequired && !/^[A-Za-z0-9._-]{3,24}$/.test(username.trim())) {
      setNotice("Username must be 3–24 characters using letters, numbers, dots, underscores, or hyphens.")
      return
    }
    if (!passwordStrong) {
      setNotice(`Use at least ${passwordMinimum} characters with uppercase and lowercase letters, a number, and a symbol.`)
      return
    }
    if (!passwordsMatch) {
      setNotice("Passwords do not match. Please try again.")
      return
    }
    setBusy(true)
    window.localStorage.setItem(MOBILE_POLICY_PENDING_KEY, MOBILE_POLICY_VERSION)
    const result = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: `${first.trim()} ${last.trim()}`.trim(),
          username: username.trim(),
        },
        emailRedirectTo: mobileRedirectUrl(),
      },
    })
    setBusy(false)
    const message = result.error?.message.toLowerCase() || ""
    const code = result.error?.code?.toLowerCase() || ""
    const duplicate =
      code === "user_already_exists" ||
      message.includes("already registered") ||
      message.includes("already exists") ||
      (Array.isArray(result.data.user?.identities) && result.data.user.identities.length === 0)
    if (result.error || duplicate) {
      window.localStorage.removeItem(MOBILE_POLICY_PENDING_KEY)
      setNotice(duplicate
        ? "An account with this email already exists. Sign in instead."
        : result.error?.message || "Account creation failed.")
      return
    }
    if (!result.data.session) {
      setVerification(true)
      return
    }
    leaveGuestMode()
    await finishPendingPolicyAcceptance().catch((cause) => {
      console.warn("Policy acceptance will retry on the next session", cause)
    })
    nav("/shop")
  }

  if (verification) {
    return (
      <main className="auth-phone registration-verify">
        <Link className="back-link" to="/sign-in">← Back to sign in</Link>
        <section>
          <span className="registration-check">✓</span>
          <p className="eyebrow-auth">CONFIRM YOUR EMAIL</p>
          <h1>One last step.</h1>
          <p>
            We sent a secure confirmation link to <b>{email.trim().toLowerCase()}</b>.
            Verify your email before signing in to CozyCraft.
          </p>
          <button className="auth-primary" onClick={() => nav("/sign-in")}>
            I confirmed my email <b>→</b>
          </button>
          <button
            className="registration-resend"
            disabled={resending}
            onClick={async () => {
              setResending(true)
              setNotice("")
              const { error } = await supabase.auth.resend({
                type: "signup",
                email: email.trim().toLowerCase(),
                options: { emailRedirectTo: mobileRedirectUrl() },
              })
              setResending(false)
              setNoticeKind(error ? "error" : "success")
              setNotice(error ? error.message : "A new confirmation email was sent.")
            }}
          >
            {resending ? "Sending…" : "Resend confirmation email"}
          </button>
          {notice && <p className={`form-notice ${noticeKind}`}>{notice}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="auth-phone form-page create deluxe-create">
      <header className="create-top">
        <BackLink />
        <span>
          01 <i /> 02
        </span>
      </header>
      <section className="create-intro">
        <Mark />
        <p className="eyebrow-auth">HOME CIRCLE MEMBERSHIP</p>
        <h1>
          Make it
          <br />
          <em>yours.</em>
        </h1>
        <p className="intro">A considered account for a considered home.</p>
      </section>
      <section className="create-form-card">
        <div className="membership-note">
          <span>✦</span>
          <p>
            <b>Member first</b>
            <small>
              Early access, personal delivery updates, and points on every
              purchase.
            </small>
          </p>
        </div>
        {googleEnabled && (
          <>
            <button
              type="button"
              className="google create-google"
              onClick={async () => {
                leaveGuestMode()
                setNotice("")
                window.localStorage.setItem(MOBILE_POLICY_PENDING_KEY, MOBILE_POLICY_VERSION)
                const { data, error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: {
                    redirectTo: mobileRedirectUrl(),
                    skipBrowserRedirect: window.parent !== window,
                  },
                })
                if (error) setNotice(error.message)
                else if (data.url && window.parent !== window) {
                  window.parent.postMessage({ type: "cozycraft-open-oauth", url: data.url }, "*")
                }
              }}
            >
              <img src={googleMark} alt="" aria-hidden="true" />
              Continue with Google
            </button>
            <div className="or"><span />OR<span /></div>
          </>
        )}
        <form onSubmit={submit} noValidate>
          <div className="registration-name-grid">
            <Field label="First name" value={first} onChange={setFirst} autoComplete="given-name" />
            <Field label="Last name" value={last} onChange={setLast} autoComplete="family-name" />
          </div>
          {usernameRequired && (
            <Field
              label="Username"
              value={username}
              onChange={(value) => setUsername(value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24))}
              autoComplete="username"
              hint="3–24 characters; letters, numbers, dots, underscores, or hyphens"
            />
          )}
          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <Field
            label="Create a password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={`At least ${passwordMinimum} characters`}
          />
          <div className="password-strength" aria-live="polite">
            <div>
              {requirements.map((passed, level) => (
                <i
                  className={passed ? "active" : ""}
                  key={level}
                />
              ))}
            </div>
            <span>{strength || "Secure password"}</span>
          </div>
          <p className="password-guidance">
            Use uppercase and lowercase letters, a number, and a symbol.
          </p>
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            hint={confirm ? (passwordsMatch ? "Passwords match" : "Passwords do not match") : undefined}
          />
          <label className="agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I agree to CozyCraft’s{" "}
              <Link to="/terms" onClick={(event) => event.stopPropagation()}>Terms</Link> and{" "}
              <Link to="/privacy-policy" onClick={(event) => event.stopPropagation()}>Privacy Policy</Link>.
            </span>
          </label>
          <button className="auth-primary" type="submit" disabled={busy}>
            {busy ? "CREATING ACCOUNT…" : "CREATE MY ACCOUNT"} <b>→</b>
          </button>
          {notice && (
            <p className={`form-notice ${noticeKind}`} role="alert">
              {notice}
            </p>
          )}
        </form>
        <p className="switch-auth">
          Already a member? <Link to="/sign-in">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
function Missing() {
  return (
    <main className="auth-phone welcome">
      <section>
        <Mark />
        <p className="eyebrow-auth">PAGE NOT FOUND</p>
        <h1>
          This room is
          <br />
          <em>still empty.</em>
        </h1>
        <p className="intro">Let's take you somewhere familiar.</p>
        <Link to="/welcome" className="auth-primary">
          BACK TO WELCOME <b>→</b>
        </Link>
      </section>
    </main>
  )
}
export const router = createHashRouter([
  { path: "/", Component: Splash },
  { path: "/welcome", Component: Welcome },
  { path: "/sign-in", Component: SignIn },
  { path: "/reset-password", Component: ResetPassword },
  { path: "/create-account", Component: CreateAccount },
  { path: "/terms", Component: () => <LegalDocument kind="terms" /> },
  { path: "/privacy-policy", Component: () => <LegalDocument kind="privacy" /> },
  { path: "/about", Component: () => <ContentDocument kind="about" /> },
  { path: "/contact", Component: () => <ContentDocument kind="contact" /> },
  { path: "/shop", Component: () => <CustomerSecurityGate><Suspense fallback={<main className="storefront-loading" role="status"><span/><p>Preparing your home…</p></main>}><Storefront /></Suspense></CustomerSecurityGate> },
  { path: "*", Component: Missing },
])

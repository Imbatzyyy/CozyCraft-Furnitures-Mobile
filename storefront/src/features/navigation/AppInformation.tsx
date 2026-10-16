import { APP_DEVELOPERS, type AppInfoSection } from "./app-navigation-data"
import cozyLogo from "../../imports/COZy.png"
import CozyCompanion from "../../components/CozyCompanion"
import DocumentSections from "../../components/DocumentSections"
import type { MobileStoreSettings } from "../../lib/mobile-data"
import PolicyContent from "./PolicyContent"
import useInformationPage from "./useInformationPage"

function ContactInformation({ settings, support }: { settings?: MobileStoreSettings; support: () => void }) {
  const { page, loading, failed, retry } = useInformationPage("contact")
  const pageEmail = page?.body.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || ""
  const email = settings?.contact_email?.trim() || pageEmail
  const validEmail = /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(email)
  const phone = settings?.support_phone?.trim() || ""
  const dial = phone.replace(/[\s().-]/g, "")
  const validPhone = /^\+?\d{7,15}$/.test(dial)
  return <>
    <div className="ccnav-editorial ccnav-contact-intro"><CozyCompanion pose="wave" compact/><p className="ccnav-eyebrow">CozyCraft Care</p><h1>A little help.<br/><em>A lot of care.</em></h1><p>Questions about a piece, your order, or your account? Let’s find the right place to help.</p></div>
    <div className="ccnav-contact-actions"><button type="button" onClick={support}><span className="material-symbols-rounded" aria-hidden="true">support_agent</span><span><b>Open Care & support</b><small>FAQs and private, order-linked requests</small></span><span aria-hidden="true">↗</span></button>
      {validEmail && <a href={`mailto:${email}`}><span className="material-symbols-rounded" aria-hidden="true">mail</span><span><b>Email customer care</b><small>{email}</small></span><span aria-hidden="true">↗</span></a>}
      {validPhone && <a href={`tel:${dial}`}><span className="material-symbols-rounded" aria-hidden="true">call</span><span><b>Call customer care</b><small>{phone}</small></span><span aria-hidden="true">↗</span></a>}
    </div>
    {settings?.business_address && <p className="ccnav-address">{settings.business_address}</p>}
    <div className="ccnav-content-status" role="status">{loading ? "Checking customer-care information…" : failed ? <>{page ? "Showing saved contact information. We couldn’t check for updates." : "Contact information is unavailable. You can still open Care & support."}<button type="button" onClick={retry}>Try again</button></> : null}</div>
    {page && <article className="ccnav-contact-copy"><h2>{page.title}</h2><p>{page.summary}</p><DocumentSections body={page.body}/></article>}
  </>
}

export default function AppInformation({ section, changeSection, shop, support, storeSettings }: {
  section: AppInfoSection
  changeSection: (section: AppInfoSection) => void
  shop: () => void
  support: () => void
  storeSettings?: MobileStoreSettings
}) {
  if (section === "terms" || section === "privacy") return <div className="ccnav-information ccnav-document"><PolicyContent kind={section}/><div className="ccnav-page-actions"><button type="button" onClick={() => changeSection("contact")}>Questions? Contact us <span aria-hidden="true">→</span></button><button type="button" onClick={() => changeSection(section === "terms" ? "privacy" : "terms")}>{section === "terms" ? "Read Privacy Policy" : "Read Terms of Service"}<span aria-hidden="true">→</span></button></div></div>
  if (section === "contact") return <div className="ccnav-information"><ContactInformation settings={storeSettings} support={support}/></div>
  if (section === "history") return <div className="ccnav-information">
    <div className="ccnav-editorial"><p className="ccnav-eyebrow">Vision Ventures · Established 2026</p><h1>Our story,<br/><em>made for home.</em></h1><p>CozyCraft Furnitures began in 2026 with Vision Ventures and a simple purpose: make furniture shopping more convenient, accessible, and organized for Philippine homes.</p></div>
    <ol className="ccnav-timeline">{[
      ["The beginning", "A more thoughtful way to shop", "The project grew from familiar shopping frustrations: message-based ordering, scattered product information, and limited visibility after an order was placed."],
      ["Building the connection", "From discovery to delivery", "CozyCraft brought the catalog, inventory, checkout, order tracking, reviews, and customer care into one connected experience."],
      ["Bringing it closer", "Comfort, wherever you are", "The mobile app carries that experience onto iPhone and Android, with saved favourites, a shopping bag, account tools, and Home Circle rewards."],
    ].map(([label, title, copy], index) => <li key={label}><span className="ccnav-timeline-number" aria-hidden="true">0{index + 1}</span><div><p className="ccnav-eyebrow">{label}</p><h2>{title}</h2><p>{copy}</p></div></li>)}</ol>
    <aside className="ccnav-team-note"><span className="material-symbols-rounded" aria-hidden="true">spa</span><div><h2>Still guided by the same purpose.</h2><p>Help every customer choose furniture with confidence and follow every order with clarity.</p></div></aside>
    <div className="ccnav-page-actions"><button type="button" onClick={() => changeSection("developers")}>Meet the app team <span aria-hidden="true">→</span></button><button type="button" onClick={() => changeSection("about")}>About CozyCraft <span aria-hidden="true">→</span></button></div>
  </div>
  return <div className="ccnav-information" key={section}>
    <div className="ccnav-editorial">
      <p className="ccnav-eyebrow">{section === "about" ? "Thoughtfully made. Effortlessly yours." : "Vision Ventures · The app team"}</p>
      <h1 id="ccnav-info-title">{section === "about" ? <>A little closer<br/>to <em>feeling home.</em></> : <>The people<br/>behind <em>the comfort.</em></>}</h1>
      <p>{section === "about" ? "CozyCraft Furnitures brings discovering, choosing, and caring for your furniture into one considered shopping experience." : "Five people, one shared purpose: making furniture shopping feel a little more personal."}</p>
    </div>
    {section === "about" ? <>
      <section className="ccnav-brand-card" aria-label="CozyCraft Furnitures">
        <img src={cozyLogo} alt="CozyCraft Furniture" width="180" height="96"/>
        <div><span className="ccnav-eyebrow">Our purpose</span><h2>Furniture for a life<br/><em>well lived.</em></h2><p>Find pieces for your living room, bedroom, and dining space, with the details you need to choose with confidence.</p></div>
      </section>
      <section className="ccnav-features" aria-labelledby="ccnav-features-title">
        <span className="ccnav-eyebrow">At your fingertips</span><h2 id="ccnav-features-title">From first look to your front door.</h2>
        <dl>{[
          ["01", "Discover your fit", "Browse rooms, search for a piece, refine prices, and compare the details that matter."],
          ["02", "Keep your favourites close", "Save a wishlist and build your shopping bag at your own pace."],
          ["03", "Follow every order", "Manage delivery details, check your orders, and request an invoice for a delivered order."],
          ["04", "Feel looked after", "Explore Home Circle rewards, read customer reviews, and reach CozyCraft Care when you need a hand."],
        ].map(([number, title, copy]) => <div key={number}><span aria-hidden="true">{number}</span><div><dt>{title}</dt><dd>{copy}</dd></div></div>)}</dl>
      </section>
      <div className="ccnav-page-actions"><button type="button" onClick={shop}>Explore the collection <span aria-hidden="true">↗</span></button><button type="button" onClick={() => changeSection("history")}>Read our company history <span aria-hidden="true">→</span></button><button type="button" onClick={() => changeSection("developers")}>Meet the developers <span aria-hidden="true">→</span></button></div>
    </> : <>
      <div className="ccnav-team" aria-label="CozyCraft app developers">
        {APP_DEVELOPERS.map((person, index) => <article className="ccnav-person" key={person.name}>
          <img src={person.image} alt={person.name} width="240" height="240" loading="lazy" decoding="async"/>
          <div><span className="ccnav-person-number" aria-hidden="true">0{index + 1}</span><h2>{person.name}</h2><p className="ccnav-person-role">{person.role}</p><p className="ccnav-person-description">{person.description}</p>
            {person.contact ? <a href={person.contact.href} target="_blank" rel="noopener noreferrer">{person.contact.label}<span aria-hidden="true"> ↗</span></a> : <small className="ccnav-contact-pending">Contact details to be provided</small>}
          </div>
        </article>)}
      </div>
      <aside className="ccnav-team-note"><span className="material-symbols-rounded" aria-hidden="true">spa</span><div><h2>Made together, with care.</h2><p>Connect with the mobile app development team using the email links above. For help with a purchase, open Account, then Care &amp; Support.</p></div></aside>
      <div className="ccnav-page-actions"><button type="button" onClick={() => changeSection("about")}>Discover the app <span aria-hidden="true">→</span></button><button type="button" onClick={shop}>Back to the collection <span aria-hidden="true">↗</span></button></div>
    </>}
    <footer className="ccnav-info-footer">COZYCRAFT FURNITURES<span>A considered home. A connected experience.</span></footer>
  </div>
}

import { APP_DEVELOPERS, type AppInfoSection } from "./app-navigation-data"
import cozyLogo from "../../imports/COZy.png"

export default function AppInformation({ section, changeSection, shop }: {
  section: AppInfoSection
  changeSection: (section: AppInfoSection) => void
  shop: () => void
}) {
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
      <div className="ccnav-page-actions"><button type="button" onClick={shop}>Explore the collection <span aria-hidden="true">↗</span></button><button type="button" onClick={() => changeSection("developers")}>Meet the developers <span aria-hidden="true">→</span></button></div>
    </> : <>
      <div className="ccnav-team" aria-label="CozyCraft app developers">
        {APP_DEVELOPERS.map((person, index) => <article className="ccnav-person" key={person.name}>
          <img src={person.image} alt={person.name} width="240" height="240" loading="lazy" decoding="async"/>
          <div><span className="ccnav-person-number" aria-hidden="true">0{index + 1}</span><h2>{person.name}</h2><p>{person.role}</p>
            {person.contact ? <a href={person.contact.href} target="_blank" rel="noopener noreferrer">{person.contact.label}<span aria-hidden="true"> ↗</span></a> : <small className="ccnav-contact-pending">Contact details to be provided</small>}
          </div>
        </article>)}
      </div>
      <aside className="ccnav-team-note"><span className="material-symbols-rounded" aria-hidden="true">spa</span><div><h2>Made together, with care.</h2><p>Connect with the mobile app development team using the email links above. For help with a purchase, please use Care & support in the menu.</p></div></aside>
      <div className="ccnav-page-actions"><button type="button" onClick={() => changeSection("about")}>Discover the app <span aria-hidden="true">→</span></button><button type="button" onClick={shop}>Back to the collection <span aria-hidden="true">↗</span></button></div>
    </>}
    <footer className="ccnav-info-footer">COZYCRAFT FURNITURES<span>A considered home. A connected experience.</span></footer>
  </div>
}

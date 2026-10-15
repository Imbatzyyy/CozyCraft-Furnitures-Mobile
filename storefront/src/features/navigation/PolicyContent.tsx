import DocumentSections from "../../components/DocumentSections"
import { MOBILE_POLICY_VERSION, privacySections, termsSections } from "./legal-content"
import useInformationPage from "./useInformationPage"

// One policy reader for registration links and the drawer; viewing never writes consent.
export default function PolicyContent({ kind }: { kind: "terms" | "privacy" }) {
  const { page, loading, failed, retry } = useInformationPage(kind)
  const terms = kind === "terms"
  const sections = terms ? termsSections : privacySections
  return <article className="ccnav-policy">
    <p className="ccnav-eyebrow">CozyCraft Furnitures · Philippines</p>
    <h1>{page?.title || (terms ? "Terms of Service" : "Privacy Policy")}</h1>
    <p className="legal-effective">{page ? (page.updated_at && Number.isFinite(Date.parse(page.updated_at)) ? `Published content · Updated ${new Date(page.updated_at).toLocaleDateString("en-PH", { dateStyle: "long" })}` : "Published policy") : `Bundled policy · Version ${MOBILE_POLICY_VERSION}`}</p>
    <div className="legal-summary"><span>{terms ? "A fair shopping agreement" : "Your data, treated with care"}</span><p>{page?.summary || (terms ? "Clear rules for accounts, orders, payments, delivery, returns, and support across the CozyCraft app and website." : "A plain-language explanation of what CozyCraft collects, why it is needed, who receives it, and how you can exercise your rights.")}</p></div>
    <div className="ccnav-content-status" role="status">{loading ? "Checking for the latest information…" : failed ? <>{page ? "Showing a saved copy. Latest information is unavailable." : "Showing the bundled policy. Latest information is unavailable."}<button type="button" onClick={retry}>Try again</button></> : null}</div>
    {page?.body?.trim() ? <DocumentSections body={page.body}/> : sections.map(section => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}</section>)}
  </article>
}

import { documentSections } from "../lib/document-sections"

function ContactText({ text }: { text: string }) {
  return <>{text.split(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g).map((part, index) =>
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(part)
      ? <a key={index} href={`mailto:${part}`}>{part}</a> : part)}</>
}

export default function DocumentSections({ body }: { body: string }) {
  return <>{documentSections(body).map((section, index) => <section key={index}>
    {section.heading && <h2 className="document-section-heading">{section.heading[0]}{section.heading.slice(1).toLowerCase()}</h2>}
    {section.paragraphs.map((paragraph, line) => <p key={line}><ContactText text={paragraph}/></p>)}
  </section>)}</>
}

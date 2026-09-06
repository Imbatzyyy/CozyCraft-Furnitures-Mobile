export type DocumentSection = { heading: string; paragraphs: string[] }

/** CMS pages are plain text. Preserve their heading lines without rendering HTML. */
export function documentSections(body: string): DocumentSection[] {
  return body.split(/\n\s*\n/).map((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const first = lines[0] || ""
    const heading = lines.length > 1 && first.length <= 100 && /[A-Z]/.test(first)
      && first === first.toUpperCase() && !first.includes("@") ? first : ""
    return { heading, paragraphs: heading ? lines.slice(1) : lines }
  }).filter((section) => section.heading || section.paragraphs.length)
}

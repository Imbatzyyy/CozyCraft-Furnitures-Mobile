import { describe, expect, it } from "vitest"
import { documentSections } from "./document-sections"

describe("documentSections", () => {
  it("preserves CMS headings and distinct lines", () => {
    expect(documentSections("BUSINESS EMAIL\ncare@example.test\n\nCARE HOURS\nMonday to Saturday\nMessages may be sent anytime.")).toEqual([
      { heading: "BUSINESS EMAIL", paragraphs: ["care@example.test"] },
      { heading: "CARE HOURS", paragraphs: ["Monday to Saturday", "Messages may be sent anytime."] },
    ])
  })
  it("does not invent headings or interpret HTML", () => {
    expect(documentSections("A normal paragraph.\nAnother line.\n\n<script>unsafe</script>")[0].heading).toBe("")
    expect(documentSections("\n\n")).toEqual([])
  })
})

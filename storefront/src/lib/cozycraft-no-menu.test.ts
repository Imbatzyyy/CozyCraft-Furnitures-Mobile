import { describe, expect, it } from "vitest"
import { APP_DEVELOPERS } from "../features/navigation/app-navigation-data"
import { MOBILE_CARE_PAGES } from "./cozycraft-no-menu"
import { mobileAssistantGuidanceFor } from "./mobile-chat"

describe("isolated no-menu variant", () => {
  it("keeps five profiles and uses Jacob's website identity without Samuel's email", () => {
    expect(APP_DEVELOPERS).toHaveLength(5)
    const jacob = APP_DEVELOPERS.find(person => person.name === "Jacob Christopher Cañete")
    expect(jacob?.role).toBe("Platform Development")
    expect(jacob?.image).toBe("./team/jacob-christopher-canete.jpg")
    expect(jacob?.description.length).toBeGreaterThan(40)
    expect(jacob?.contact).toEqual({ label: "qjcanete02@tip.edu.ph", href: "mailto:qjcanete02@tip.edu.ph" })
    expect(JSON.stringify(APP_DEVELOPERS)).not.toMatch(/samm?uel|qsgconcepcion/i)
  })
  it.each(MOBILE_CARE_PAGES)("has no removed menu in $title directions", page => {
    expect(page.steps.join(" ")).not.toMatch(/\bmenu\b/i)
  })
  it("gives variant-specific team and navigation answers", () => {
    expect(mobileAssistantGuidanceFor("Who are the app developers?", true)?.reply).toContain("Jacob Christopher Cañete")
    expect(mobileAssistantGuidanceFor("What pages are in the app?", true)?.reply).toContain("There is no side menu")
    expect(mobileAssistantGuidanceFor("Where is Privacy?", true)?.reply).toContain("beneath Company History and Terms")
    expect(mobileAssistantGuidanceFor("hello", true)).toBeNull()
  })
})

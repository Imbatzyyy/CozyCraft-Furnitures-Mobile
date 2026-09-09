import { beforeEach, describe, expect, it } from "vitest"
import { clearGoogleOnboardingDraft, readGoogleOnboardingDraft, retainGoogleOnboardingDraftFor, saveGoogleOnboardingDraft } from "./google-onboarding-draft"

beforeEach(() => clearGoogleOnboardingDraft())
describe("account-scoped Google setup draft", () => {
  it("survives same-account rehydration but clears on logout", () => {
    saveGoogleOnboardingDraft({ userId: "a", firstName: "Edited", lastName: "Name", username: "edited.home", nameConfirmed: true })
    retainGoogleOnboardingDraftFor("a")
    expect(readGoogleOnboardingDraft("a", "Original Name", "").nameConfirmed).toBe(true)
    retainGoogleOnboardingDraftFor("")
    expect(readGoogleOnboardingDraft("a", "Original Name", "").nameConfirmed).toBe(false)
  })
  it("never lets a late save from the previous account clear the next account's draft", () => {
    saveGoogleOnboardingDraft({ userId: "a", firstName: "A", lastName: "Name", username: "a.home", nameConfirmed: true })
    retainGoogleOnboardingDraftFor("b")
    expect(readGoogleOnboardingDraft("b", "B Name", "").firstName).toBe("B")
    saveGoogleOnboardingDraft({ userId: "b", firstName: "Edited B", lastName: "Name", username: "b.home", nameConfirmed: true })
    clearGoogleOnboardingDraft("a")
    expect(readGoogleOnboardingDraft("b", "B Name", "").firstName).toBe("Edited B")
  })
})

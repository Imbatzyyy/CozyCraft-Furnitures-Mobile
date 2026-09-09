import { describe, expect, it } from "vitest"
import { emptyGoogleOnboardingStatus, mergeGoogleOnboarding } from "./google-customer-onboarding"
describe("onboarding stale-response protection", () => {
  it("does not reopen username setup after a committed completion", () => {
    const completed = { ...emptyGoogleOnboardingStatus("one"), username: "joy.home", isGoogle: true, showVoucher: true }
    expect(mergeGoogleOnboarding(completed, { ...completed, username: "", needsUsername: true, showVoucher: false })).toBe(completed)
  })
  it("accepts a different account and normal voucher acknowledgement", () => {
    const completed = { ...emptyGoogleOnboardingStatus("one"), username: "joy.home", showVoucher: true }
    const acknowledged = { ...completed, showVoucher: false }
    expect(mergeGoogleOnboarding(completed, acknowledged)).toBe(acknowledged)
    const other = { ...emptyGoogleOnboardingStatus("two"), needsUsername: true }
    expect(mergeGoogleOnboarding(completed, other)).toBe(other)
  })
})

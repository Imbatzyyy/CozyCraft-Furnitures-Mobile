import { describe, expect, it } from "vitest"
import { authenticatorChallengeRequired, sessionIdFromToken, shouldRecheckAuthenticator } from "./account-security"

describe("website-compatible mobile account security", () => {
  it("requires AAL2 for enrolled accounts but keeps ordinary customer sign-in unchanged", () => {
    expect(authenticatorChallengeRequired("aal1", "aal2")).toBe(true)
    expect(authenticatorChallengeRequired("aal2", "aal2")).toBe(false)
    expect(authenticatorChallengeRequired("aal1", "aal1")).toBe(false)
    expect(authenticatorChallengeRequired(null, "aal2")).toBe(true)
  })
  it.each(["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "MFA_CHALLENGE_VERIFIED", "USER_UPDATED"])("rechecks after %s", (event) => {
    expect(shouldRecheckAuthenticator(event)).toBe(true)
  })
  it("accepts only UUID session identifiers for the server-validated device registry", () => {
    const id = "22a0851f-a10f-4e42-b16d-963f558701aa"
    expect(sessionIdFromToken(`header.${btoa(JSON.stringify({ session_id: id }))}.signature`)).toBe(id)
    expect(sessionIdFromToken("malformed")).toBeNull()
    expect(sessionIdFromToken(`header.${btoa(JSON.stringify({ session_id: "admin" }))}.signature`)).toBeNull()
  })
})

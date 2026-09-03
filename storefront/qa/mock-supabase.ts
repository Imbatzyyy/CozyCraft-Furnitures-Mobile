// All requests stay in memory. There is no production Supabase client in QA.
const user = { id: "8150a7d9-8f0c-49fd-8816-35b18a399a6a", email: "alex@example.test", app_metadata: { provider: "email" }, user_metadata: {} }
let requestedPhone = ""
let verifiedPhone = ""
let verifiedAt: string | null = null
let assurance = "aal1"
const requiresAuthenticator = new URLSearchParams(window.location.search).has("authenticator")

export const createClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: { user, access_token: "local-fixture" } }, error: null }),
    getUser: async () => ({ data: { user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: assurance, nextLevel: requiresAuthenticator ? "aal2" : assurance }, error: null }),
      listFactors: async () => ({ data: { totp: requiresAuthenticator ? [{ id: "local-factor", status: "verified" }] : [] }, error: null }),
      challengeAndVerify: async ({ code }: { code: string }) => {
        if (code !== "012345") return { error: new Error("Invalid fixture code") }
        assurance = "aal2"
        return { data: {}, error: null }
      },
    },
  },
  from: () => {
    const result = () => ({ data: { phone: verifiedPhone, phone_verified_at: verifiedAt, delivery_updates: true, home_circle_notes: false }, error: null })
    const query = { select: () => query, eq: () => query, single: async () => result(), maybeSingle: async () => result(), upsert: async () => ({ error: null }) }
    return query
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel },
  removeChannel() {},
  functions: { invoke: async (name: string, { body }: { body: { action: string; phone?: string; code?: string } }) => {
    if (name !== "verify-customer-phone") throw new Error("This operation is not available in the local fixture")
    if (body.action === "request") {
      requestedPhone = body.phone || ""
      return { data: { status: "code_sent", challengeId: "0f329e1a-e7fa-4fb1-aa4d-4f3f8d187309", maskedPhone: "+6391•••4567", expiresAt: new Date(Date.now() + 300_000).toISOString(), resendAfter: 60 }, error: null }
    }
    if (body.code !== "012345") return { data: null, error: { context: new Response(JSON.stringify({ error: "That code is incorrect. Please check the message and try again.", attemptsRemaining: 4 }), { status: 400 }) } }
    verifiedPhone = requestedPhone
    verifiedAt = new Date().toISOString()
    return { data: { status: "verified", phone: verifiedPhone, phoneVerifiedAt: verifiedAt }, error: null }
  } },
})

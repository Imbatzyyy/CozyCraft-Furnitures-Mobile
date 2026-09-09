// All requests stay in memory. There is no production Supabase client in QA.
const user = { id: "8150a7d9-8f0c-49fd-8816-35b18a399a6a", email: "alex@example.test", app_metadata: { provider: "email" }, user_metadata: {} }
let requestedPhone = ""
let verifiedPhone = ""
let verifiedAt: string | null = null
let assurance = "aal1"
const requiresAuthenticator = new URLSearchParams(window.location.search).has("authenticator")

const fixtureAddress = {
  id: "99bdb728-40a8-4575-ac91-31228449c349",
  label: "Home",
  recipient_name: "Alex Rivera",
  mobile: "+639171234567",
  email: "alex@example.test",
  address_line: "18 Narra Street",
  barangay: "Bagong Pag-asa",
  city: "Quezon City",
  province: "Metro Manila",
  postal_code: "1105",
  delivery_note: "Call when arriving",
  is_primary: true,
}

export const createClient = () => ({
  auth: {
    signUp: async () => ({ data: { user: { ...user, identities: [{ id: "fixture" }] }, session: null }, error: null }),
    resend: async () => ({ error: null }),
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
  from: (table: string) => {
    const result = () => ({
      data: table === "addresses"
        ? [fixtureAddress]
        : table === "reviews" ? [{ id: "qa-review", rating: 5, body: "The seat is comfortable and the finish looks beautiful in our home. Delivery was carefully handled.", image_urls: ["/furniture/photo-1599696848652-f0ff23bc911f.jpg", "/furniture/photo-1599696848652-f0ff23bc911f.jpg"], created_at: "2026-09-01T09:00:00Z", approved: true, reviewer_display_name: "Alexandra Rivera Santos" }]
        : ["support_tickets", "return_requests"].includes(table) ? []
        : table === "content_pages" ? null
        : table === "store_settings" ? { account_settings: { password_minimum_length: 10, username_required: true, google_auth_enabled: true } }
        : {
            phone: verifiedPhone,
            phone_verified_at: verifiedAt,
            delivery_updates: true,
            home_circle_notes: false,
            preferred_payment_method: "gcash",
          },
      error: null,
    })
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: () => query,
      limit: () => query,
      abortSignal: () => query,
      single: async () => result(),
      maybeSingle: async () => result(),
      upsert: async () => ({ error: null }),
      then: (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    }
    return query
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel },
  removeChannel() {},
  functions: { invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
    if (name === "request-order-invoice") return { data: { accepted: true, email: "alex.rivera@example.test", orderNumber: "CC-1041" }, error: null }
    if (name === "verify-mobile-payment") {
      if (body.action === "request") {
        return { data: {
          status: "code_sent", challengeId: "0f329e1a-e7fa-4fb1-aa4d-4f3f8d187309",
          maskedEmail: "al••••@e••••••.test", expiresAt: new Date(Date.now() + 300_000).toISOString(),
          resendAfter: 60, checkoutKey: body.checkoutKey, paymentMethod: body.paymentMethod,
        }, error: null }
      }
      if (body.code !== "012345") return { data: null, error: { context: new Response(JSON.stringify({ error: "That code is incorrect. 4 attempts remaining.", attemptsRemaining: 4 }), { status: 400 }) } }
      return { data: {
        status: "authorized", authorizationId: body.challengeId,
        checkoutKey: "30cfb521-9c92-4b8a-8dc7-b1cf8b663648", paymentMethod: "gcash",
        expiresAt: new Date(Date.now() + 240_000).toISOString(), verifiedAt: new Date().toISOString(),
      }, error: null }
    }
    if (name !== "verify-customer-phone") throw new Error("This operation is not available in the local fixture")
    if (body.action === "request") {
      requestedPhone = String(body.phone || "")
      return { data: { status: "code_sent", challengeId: "0f329e1a-e7fa-4fb1-aa4d-4f3f8d187309", maskedPhone: "+6391•••4567", expiresAt: new Date(Date.now() + 300_000).toISOString(), resendAfter: 60 }, error: null }
    }
    if (body.code !== "012345") return { data: null, error: { context: new Response(JSON.stringify({ error: "That code is incorrect. Please check the message and try again.", attemptsRemaining: 4 }), { status: 400 }) } }
    verifiedPhone = requestedPhone
    verifiedAt = new Date().toISOString()
    return { data: { status: "verified", phone: verifiedPhone, phoneVerifiedAt: verifiedAt }, error: null }
  } },
})

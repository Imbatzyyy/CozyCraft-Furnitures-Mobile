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

const fixtureClient = () => ({
  auth: {
    updateUser: async () => ({ error: null }),
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
  rpc: async (name: string, args: { p_address?: Partial<typeof fixtureAddress>; p_primary_only?: boolean }) => {
    if (name === "save_mobile_delivery_address") {
      Object.assign(fixtureAddress, args.p_address, args.p_primary_only ? { is_primary: true } : {})
      return { data: { ...fixtureAddress }, error: null }
    }
    return { data: null, error: null }
  },
  functions: { invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
    if (name === "resume-paymongo-checkout") {
      await new Promise(resolve => setTimeout(resolve, 300))
      return { data: null, error: { context: new Response(JSON.stringify({ error: "Secure payment is temporarily unavailable. Please try again." }), { status: 503 }) } }
    }
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

// `?shell` runs the complete storefront (launch, tabs, overlays) on sample
// catalog rows. Every table read resolves locally; writes are accepted and discarded.
const shellMode = new URLSearchParams(window.location.search).has("shell")
const shellPhotos = ["photo-1599696848652-f0ff23bc911f", "photo-1540638349517-3abd5afc5847", "photo-1567016376408-0226e4d0c1ea", "photo-1600210492486-724fe5c67fb0", "photo-1617806118233-18e1de247200", "photo-1507473885765-e6ed057f782c", "photo-1637412816281-f80ec9948fea"]
const shellCatalog = [
  ["Ekolsund reclining armchair", "Living Room", "Sofas", 12999, 12, "Fabric, Oak", 4.8, 12],
  ["Harbor three-seater sofa", "Living Room", "Sofas", 38990, 4, "Linen", 4.6, 8],
  ["Alder round coffee table", "Living Room", "Coffee Tables", 8450, 20, "Solid wood", 4.9, 21],
  ["Linden queen bed frame", "Bedroom", "Beds", 27500, 6, "Walnut veneer", 4.7, 5],
  ["Maple six-seat dining table", "Dining Room", "Dining Tables", 31200, 3, "Maple", 5, 3],
  ["Juniper side lamp table", "Bedroom", "Nightstands", 4990, 30, "Ash", 4.4, 9],
  ["Cove accent chair", "Living Room", "Accent Chairs", 9990, 0, "Boucle", 0, 0],
].map(([name, category, subcategory, price, stock, material, rating, reviews], index) => ({
  id: `shell-product-${index + 1}`, name, category, subcategory, price, stock_quantity: stock, status: "active", material,
  dimensions: "Width 85 cm, Depth 90 cm, Height 80 cm", description: `A considered ${String(name).toLowerCase()} for everyday comfort.`,
  images: index === 0 ? [`/furniture/${shellPhotos[0]}.jpg`] : [`/furniture/${shellPhotos[index % 7]}.jpg`, `/furniture/${shellPhotos[(index + 3) % 7]}.jpg`],
  main_image_index: 0, rating, review_count: reviews,
}))
const shellRows = (table: string) => table === "products" ? shellCatalog
  : table === "cart_items" ? [{ product_id: "shell-product-1", quantity: 1, selected_for_checkout: true }, { product_id: "shell-product-3", quantity: 2, selected_for_checkout: true }]
  : table === "wishlist_items" ? [{ product_id: "shell-product-2" }, { product_id: "shell-product-4" }]
  : table === "addresses" ? [fixtureAddress]
  : table === "reviews" ? [{ id: "qa-review", rating: 5, body: "The seat is comfortable and the finish looks beautiful in our home.", image_urls: [], created_at: "2026-09-01T09:00:00Z", approved: true, reviewer_display_name: "Alexandra Rivera Santos" }]
  : []
const shellSingle = (table: string) => table === "profiles" ? { id: user.id, role: "customer", full_name: "Alex Rivera", username: "alex", email: user.email, phone: "+639171234567", phone_verified_at: "2026-09-01T09:00:00Z", avatar_url: "" }
  : table === "store_settings" ? { account_settings: { password_minimum_length: 10, username_required: true, google_auth_enabled: true }, fulfillment_settings: { return_window_days: 7 } }
  : null
const shellClient = () => {
  const base = fixtureClient()
  const from = (table: string) => {
    const query: Record<string, unknown> = new Proxy({}, {
      get(_target, key) {
        if (key === "single" || key === "maybeSingle") return async () => ({ data: shellSingle(table), error: null })
        if (key === "then") return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: shellRows(table), error: null, count: shellRows(table).length }).then(resolve, reject)
        return () => query
      },
    })
    return query
  }
  return {
    ...base,
    from,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }), upload: async () => ({ data: null, error: null }) }) },
    rpc: async () => ({ data: null, error: null }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  }
}
export const createClient = () => shellMode ? shellClient() : fixtureClient()

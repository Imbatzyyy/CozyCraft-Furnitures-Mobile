// Full production React tree and real Supabase client, with ALL backend HTTP
// and WebSocket traffic intercepted locally. Never creates a real customer.
import assert from "node:assert/strict"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.APP_URL || "http://127.0.0.1:5197"
const id = "11111111-1111-4111-8111-111111111111"
const jwt = [ { alg: "HS256", typ: "JWT" }, { sub: id, exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000), role: "authenticated", aal: "aal1", amr: [{ method: "oauth", timestamp: Math.floor(Date.now()/1000) }], session_id: "22222222-2222-4222-8222-222222222222" } ].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".")+".test-signature"
for (const engine of [chromium, webkit]) {
 for (const provider of ["google", "email"]) {
  for (const journey of provider === "email" ? ["finish", "skip", "returning", "retry", "reconnect"] : ["finish", "skip"]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: "no-preference" })
  const user = { id, email: "qa@example.test", role: "authenticated", aud: "authenticated", created_at: new Date().toISOString(), app_metadata: { provider, providers: [provider] }, user_metadata: { full_name: "Prince Balane", cozy_tour_pending_v1: provider === "email" }, factors: [] }
  if (journey === "returning") user.user_metadata.cozy_tour_completed_v1 = true
  const profile = { id, role: "customer", full_name: "Prince Balane", email: user.email, username: provider === "email" ? "prince.home" : "", avatar_url: "" }
const welcomeVoucher = { id: "fixture-voucher", code: "WELCOME-QA", discountAmount: 500, minimumOrderAmount: 5000, expiresAt: "2027-01-01" }
  const status = { userId: id, isGoogle: provider === "google", needsUsername: provider === "google", username: profile.username, showVoucher: provider === "email", voucher: provider === "email" ? welcomeVoucher : null }
  const counts = {}
  let reconnectGate = null, reconnectObserved = null
  const errors = []
  await context.routeWebSocket(/supabase\.(co|in)/, ws => ws.close())
  await context.route(/https:\/\/[^/]*supabase\.(co|in)\//, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    counts[path] = (counts[path] || 0) + 1
    let data = []
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } })
    if (path === "/auth/v1/user") {
      if (req.method() === "PUT") Object.assign(user.user_metadata, req.postDataJSON()?.data)
      data = user
    } else if (path === "/rest/v1/profiles") {
      if (req.method() === "PATCH") Object.assign(profile, req.postDataJSON())
      data = req.headers().accept?.includes("object") ? profile : [profile]
    } else if (path === "/rest/v1/products") data = [{ id: "qa-sofa", name: "QA sofa", category: "Living room", price: 12000, stock_quantity: 10, status: "active", images: [], rating: 5, review_count: 1 }]
    else if (path === "/rest/v1/store_settings") {
      const settings = { id: true, account_settings: { username_required: true, google_auth_enabled: true, password_minimum_length: 10 }, checkout_settings: {}, fulfillment_settings: {} }
      data = req.headers().accept?.includes("object") ? settings : [settings]
    } else if (path.endsWith("/get_mobile_google_onboarding") || path.endsWith("/get_mobile_customer_onboarding")) {
      if (journey === "retry" && counts[path] <= 2) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({message:"Temporary welcome lookup failure"}) })
      data = structuredClone(status)
      if (reconnectGate) { reconnectObserved?.(); await reconnectGate }
      // A stale status response arriving after dismissal cannot reopen it.
      if (counts[path] > 1) await new Promise(r => setTimeout(r, 800))
    }
    else if (path.endsWith("/complete_mobile_google_onboarding")) {
      await new Promise(r => setTimeout(r, 600))
      profile.username = req.postDataJSON().p_username
      Object.assign(status, { needsUsername: false, username: profile.username, showVoucher: true, voucher: { id: "fixture-voucher", code: "WELCOME-QA", discountAmount: 500, minimumOrderAmount: 5000, expiresAt: "2027-01-01" } })
      data = status
    } else if (path.endsWith("/acknowledge_mobile_welcome_voucher")) { status.showVoucher = false; data = status }
    else if (path.endsWith("/touch_customer_device_session")) data = true
    else if (path.startsWith("/functions/")) data = {}
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) })
  })
  await context.addInitScript(({ user, jwt }) => {
    localStorage.setItem("sb-gwjsivqksyimuabbdyqq-auth-token", JSON.stringify({ user, access_token: jwt, refresh_token: "qa-only", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: "bearer" }))
    localStorage.setItem("cozycraft-mobile-text-size", "extra-large")
  }, { user, jwt })
  const page = await context.newPage()
  page.on("pageerror", e => errors.push(e.message))
  page.on("console", msg => {
    if (msg.type() === "error" && /same key|Maximum update|unmounted component/i.test(msg.text())) errors.push(msg.text())
  })
  if (engine === chromium) {
    const cdp = await context.newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await page.goto(`${base}/#/shop`)
  if (provider === "google") {
  await page.getByLabel("First name", { exact: true }).waitFor({ timeout: 30000 })
  assert.equal(await page.getByRole("dialog").count(), 1, "Duplicate onboarding portals")
  await page.getByLabel("First name", { exact: true }).fill("Prince Alex")
  await page.getByLabel("Last name", { exact: true }).fill("Balane")
  await page.setViewportSize({ width: 390, height: 450 })
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.getByLabel("Username", { exact: true }).fill("prince.home")
  await page.setViewportSize({ width: 390, height: 844 })
  // Exercise the actual session observer, security gate, and storefront
  // hydration together, not just a standalone modal with static props.
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts")
    await supabase.auth.updateUser({ data: { qa_refresh: true } })
    window.dispatchEvent(new Event("focus"))
  })
  assert.equal(await page.getByLabel("Username", { exact: true }).inputValue(), "prince.home")
  await page.getByRole("button", { name: /Continue to CozyCraft/ }).click()
  }
  if (journey !== "returning") {
  await page.getByText("Welcome home.", { exact: true }).waitFor()
  await page.getByText("Show me around", { exact: false }).click()
  await page.getByText("Discover your cozy.", { exact: true }).waitFor()
  const productsBefore = counts["/rest/v1/products"]
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts")
    for (let i = 0; i < 4; i++) await supabase.auth.updateUser({ data: { qa_refresh: i } })
  })
  assert.equal(await page.getByText("Discover your cozy.", { exact: true }).count(), 1)
  assert.equal(counts["/rest/v1/products"], productsBefore, "Auth metadata writes reloaded the catalog")
  if (journey === "finish") {
    for (let n = 0; n < 3; n++) await page.getByRole("button", { name: /^Next/ }).click()
    await page.getByRole("button", { name: /^Finish/ }).click()
  } else await page.getByText("Skip tour", { exact: true }).click()
  }
  if (journey === "retry") await page.getByRole("button", { name: "Retry welcome reward" }).click()
  await page.getByText("WELCOME-QA", { exact: true }).waitFor()
  await page.waitForFunction(() => { const img = document.querySelector('.voucher-step img'); return img?.complete && img.naturalWidth > 0 })
  await page.screenshot({ path: `/tmp/cozy-full-onboarding-${provider}-${journey}-${engine.name()}.png` })
  let releaseReconnect = null
  if (journey === "reconnect") {
    reconnectGate = new Promise(resolve => { releaseReconnect = resolve })
    const observed = new Promise(resolve => { reconnectObserved = resolve })
    await page.evaluate(() => { window.dispatchEvent(new Event("offline")); window.dispatchEvent(new Event("online")) })
    await Promise.race([observed, new Promise((_, reject) => setTimeout(() => reject(new Error("Reconnect lookup did not start")), 5000))])
  }
  await page.getByText("Keep it for later", { exact: true }).click()
  await page.getByRole("dialog").waitFor({ state: "detached" })
  assert.equal(await page.locator("#root").evaluate(el => el.inert), false)
  releaseReconnect?.()
  await page.waitForTimeout(1000)
  assert.equal(await page.getByRole("dialog").count(), 0, "Late status reopened voucher")
  assert.equal(counts["/rest/v1/rpc/acknowledge_mobile_welcome_voucher"], 1)
  if (provider === "google") {
  assert.equal(profile.full_name, "Prince Alex Balane")
  assert.equal(profile.username, "prince.home")
  assert.equal(counts["/rest/v1/rpc/complete_mobile_google_onboarding"], 1)
  } else {
    assert.equal(counts["/rest/v1/rpc/complete_mobile_google_onboarding"], undefined)
  }
  assert.deepEqual(errors, [])
  await page.reload()
  await page.locator(".lux-header").waitFor()
  await page.waitForTimeout(1000)
  assert.equal(await page.getByRole("dialog").count(), 0, "Completed onboarding repeated after reload")
  assert.equal(await page.locator("#root").evaluate(el => el.inert), false)
  console.log(`${engine.name()}: FULL APP ${provider} ${journey} → voucher → dismissal → reload; no duplicate save, stale reopening, or repeated onboarding PASS`)
  await browser.close()
  }
 }
}

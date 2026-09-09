// Real app/router/Supabase client, with backend traffic intercepted. No real
// customers, orders, payment requests, emails or support messages are created.
import assert from "node:assert/strict"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.APP_URL || "http://127.0.0.1:5197"
const id = "11111111-1111-4111-8111-111111111111"
const products = ["A", "B", "C"].map(letter => ({ id: `qa-${letter}`, name: `QA Sofa ${letter}`, category: "Living room", price: 12000, stock_quantity: 10, status: "active", images: [], rating: 5, review_count: 1 }))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const failures = []
let passed = 0

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  for (const scenario of ["storage-write-denied", "storage-access-denied", "corrupt-cache", "wishlist-order", "move-rollback", "move-bag-rollback", "move-signout", "cart-rapid", "native-sender"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
    const errors = []
    const signedIn = scenario.startsWith("move-") || ["wishlist-order", "cart-rapid", "native-sender"].includes(scenario)
    const user = { id, email: "qa@example.test", role: "authenticated", aud: "authenticated", created_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "QA Customer", cozy_tour_completed_v1: true }, factors: [] }
    const profile = { id, role: "customer", full_name: "QA Customer", email: user.email, username: "qa.customer", avatar_url: "" }
    const saved = new Set(scenario.startsWith("move-") ? ["qa-A", "qa-B"] : [])
    const cart = new Map()
    let wishlistWrites = 0, moves = 0
    await context.routeWebSocket(/supabase\.(co|in)/, ws => ws.close())
    await context.route(/https:\/\/[^/]*supabase\.(co|in)\//, async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname
      if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } })
      let data = []
      if (path === "/auth/v1/user") data = user
      else if (path === "/rest/v1/profiles") data = req.headers().accept?.includes("object") ? profile : [profile]
      else if (path === "/rest/v1/products") data = products
      else if (path === "/rest/v1/store_settings") {
        const row = { id: true, account_settings: {}, checkout_settings: {}, fulfillment_settings: {} }
        data = req.headers().accept?.includes("object") ? row : [row]
      } else if (path.endsWith("/get_mobile_customer_onboarding")) data = { userId: id, isGoogle: false, needsUsername: false, showVoucher: false, voucher: null }
      else if (path.endsWith("/touch_customer_device_session")) data = true
      else if (path === "/rest/v1/wishlist_items") {
        if (req.method() === "POST") {
          wishlistWrites++
          await pause(500)
          saved.add(req.postDataJSON().product_id)
        } else if (req.method() === "DELETE") { wishlistWrites++; saved.delete(url.searchParams.get("product_id").slice(3)) }
        data = [...saved].map(product_id => ({ product_id }))
      } else if (path === "/rest/v1/cart_items") {
        if (req.method() === "POST") { const row = req.postDataJSON(); cart.set(row.product_id, row) }
        else if (req.method() === "DELETE") cart.delete(url.searchParams.get("product_id").slice(3))
        data = [...cart.values()]
      } else if (path.endsWith("/move_wishlist_item_to_cart")) {
        moves++
        await pause(700)
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA deliberate move failure" }) })
      } else if (path.startsWith("/functions/")) data = {}
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) })
    })
    await context.addInitScript(({ user, signedIn, scenario }) => {
      if (signedIn) {
        const now = Math.floor(Date.now() / 1000)
        const jwt = [{ alg: "HS256", typ: "JWT" }, { sub: user.id, exp: now + 3600, iat: now, role: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: now }], session_id: "22222222-2222-4222-8222-222222222222" }].map(v => btoa(JSON.stringify(v)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")).join(".") + ".test-signature"
        localStorage.setItem("sb-gwjsivqksyimuabbdyqq-auth-token", JSON.stringify({ user, access_token: jwt, refresh_token: "qa-only", expires_at: now + 3600, expires_in: 3600, token_type: "bearer" }))
      } else localStorage.setItem("cozycraft-browse-mode", "guest")
      if (scenario === "corrupt-cache") {
        localStorage.setItem("cozycraft-saved", "null")
        localStorage.setItem("cozycraft-pending-payment", "null")
        localStorage.setItem("cozycraft-offline-catalog-v1", "null")
        localStorage.setItem("cozycraft-bag", '[{"quantity":1}]')
        localStorage.setItem("cozycraft-profile", '"invalid old cache"')
      }
      if (scenario === "storage-write-denied") Storage.prototype.setItem = () => { throw new DOMException("Full storage", "QuotaExceededError") }
      if (scenario === "storage-access-denied") for (const key of ["localStorage", "sessionStorage"]) Object.defineProperty(window, key, { get() { throw new DOMException("Storage denied", "SecurityError") } })
    }, { user, signedIn, scenario })
    const page = await context.newPage()
    page.on("pageerror", error => errors.push(error.message))
    try {
      await page.goto(`${base}/#/shop`)
      await page.locator(".lux-nav button").first().waitFor({ timeout: 12000 })
      if (!signedIn) {
        await page.waitForTimeout(500)
        assert.equal(await page.locator(".mobile-recovery-screen").count(), 0)
      } else {
        await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("cozycraft-profile"))?.username === "qa.customer" } catch { return false } })
        await page.locator(".lux-nav button").nth(scenario.startsWith("move-") ? 1 : 0).click()
        const card = name => page.locator("article.lux-card").filter({ has: page.getByRole("button", { name: `View QA Sofa ${name}`, exact: true }) }).first()
        if (scenario === "native-sender") {
          await page.evaluate(() => {
            for (const data of [{ type: "cozycraft-native-back" }, { type: "cozycraft-open-notifications" }, { type: "cozycraft-push-token", token: "injected", platform: "ios" }]) window.dispatchEvent(new MessageEvent("message", { data, source: null }))
          })
          await page.waitForTimeout(200)
          assert.equal(await page.locator('.lux-nav button[data-nav="shop"]').getAttribute("aria-current"), "page")
          assert.equal(await page.evaluate(() => localStorage.getItem("cozycraft-native-push-token")), null)
          assert.equal(await page.getByRole("dialog").count(), 0)
          await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" }, source: window.parent })))
          await page.locator('.lux-nav button[data-nav="home"][aria-current="page"]').waitFor()
        } else if (scenario === "wishlist-order") {
          const heart = card("A").getByRole("button", { name: "Save this item", exact: true })
          await heart.click()
          await heart.click()
          await page.waitForTimeout(1000)
          assert.equal(wishlistWrites, 2)
          assert.equal(saved.has("qa-A"), false, "A slow save landed after the newer unsave")
        } else if (scenario === "cart-rapid") {
          const add = card("A").locator(".card-add")
          await add.evaluate(button => { for (let i = 0; i < 4; i++) button.click() })
          await page.waitForTimeout(800)
          assert.equal(cart.get("qa-A")?.quantity, 4, "Same-frame taps lost a bag increment")
          assert.equal(await card("A").locator(".card-add i").textContent(), "4")
        } else {
          await card("A").getByRole("button", { name: /Move to bag/i }).click()
          // Saving another piece while a move fails must not restore a whole
          // old wishlist snapshot over the customer's more recent choices.
          if (scenario === "move-signout") {
            await page.evaluate(async () => { const { enterGuestMode } = await import("/src/lib/supabase.ts"); await enterGuestMode() })
          } else if (scenario === "move-bag-rollback") {
            await page.locator(".lux-nav button").nth(0).click()
            await card("C").locator(".card-add").click()
          } else await card("B").getByRole("button", { name: "Save this item", exact: true }).click()
          await page.waitForTimeout(1500)
          assert.equal(moves, 1)
          if (scenario === "move-signout") {
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("cozycraft-saved") || "[]")), [], "Old account response restored signed-out wishlist")
          } else if (scenario === "move-bag-rollback") {
            assert.equal(cart.get("qa-C")?.quantity, 1)
            assert.equal(await card("C").locator(".card-add i").textContent(), "1", "Move failure dropped another bag addition")
          } else {
            assert.equal(await card("A").count(), 1)
            assert.equal(await card("B").count(), 0, "Move failure restored an unrelated removed wishlist item")
          }
        }
      }
      assert.deepEqual(errors, [], `${scenario} runtime errors`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
      console.log(`PASS ${engine.name()} ${scenario}`)
      passed++
    } catch (error) {
      failures.push(`${engine.name()} ${scenario}: ${error.message}; runtime: ${errors.join(" | ")}`)
      await page.screenshot({ path: `/tmp/cozy-overall-${engine.name()}-${scenario}.png` }).catch(() => {})
    } finally { await context.close() }
  }
  await browser.close()
}
console.log(`${passed} overall reliability checks passed`)
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1 }

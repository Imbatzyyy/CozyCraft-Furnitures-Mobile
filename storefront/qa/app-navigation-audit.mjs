// Full app/router, intercepted backend. No real accounts or external writes.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.APP_URL || "http://127.0.0.1:5197"
const output = process.env.QA_OUTPUT || "/tmp/cozycraft-menu-qa"
await mkdir(output, { recursive: true })
const id = "11111111-1111-4111-8111-111111111111"
const user = { id, email: "qa@example.test", role: "authenticated", aud: "authenticated", created_at: "2026-01-01", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "Alex Rivera", cozy_tour_completed_v1: true }, factors: [] }
const profile = { id, role: "customer", full_name: "Alex Rivera", email: user.email, username: "alex.rivera", avatar_url: "" }
let checked = 0
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome", headless: true } : { headless: true })
  for (const [width, height] of [[320,640], [390,844], [768,1024], [844,390], [1440,1000]]) {
    for (const text of ["comfortable", "extra-large"]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: width === 320 ? "reduce" : "no-preference" })
      await context.routeWebSocket(/supabase\.(co|in)/, ws => ws.close())
      await context.route(/https:\/\/[^/]*supabase\.(co|in)\//, async route => {
        const req = route.request(), path = new URL(req.url()).pathname
        if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } })
        let data = []
        if (path === "/auth/v1/user") data = user
        else if (path === "/rest/v1/profiles") data = req.headers().accept?.includes("object") ? profile : [profile]
        else if (path === "/rest/v1/products") data = [{ id: "qa-sofa", name: "CozyCraft sofa", category: "Living room", price: 12000, stock_quantity: 10, status: "active", images: [`${base}/furniture/photo-1599696848652-f0ff23bc911f.jpg`], rating: 5, review_count: 1 }]
        else if (path === "/rest/v1/store_settings") { const settings = { id: true, account_settings: {}, checkout_settings: {}, fulfillment_settings: {} }; data = req.headers().accept?.includes("object") ? settings : [settings] }
        else if (path.endsWith("/get_mobile_customer_onboarding")) data = { userId: id, isGoogle: false, needsUsername: false, showVoucher: false, voucher: null }
        else if (path.endsWith("/touch_customer_device_session")) data = true
        else if (path.startsWith("/functions/")) data = {}
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) })
      })
      await context.addInitScript(({ user, text, platform }) => {
        const now = Math.floor(Date.now() / 1000)
        const token = [{ alg: "HS256", typ: "JWT" }, { sub: user.id, exp: now + 3600, iat: now, role: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: now }], session_id: "22222222-2222-4222-8222-222222222222" }].map(v => btoa(JSON.stringify(v)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")).join(".") + ".test-signature"
        localStorage.setItem("sb-gwjsivqksyimuabbdyqq-auth-token", JSON.stringify({ user, access_token: token, refresh_token: "qa-only", expires_at: now + 3600, expires_in: 3600, token_type: "bearer" }))
        localStorage.setItem("cozycraft-mobile-text-size-v1", text)
        document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add(`cozy-platform-${platform}`))
      }, { user, text, platform: engine === webkit ? "ios" : "android" })
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", error => errors.push(error.message))
      if (engine === chromium && width === 320) { const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }) }
      await page.goto(`${base}/#/shop`)
      await page.getByRole("button", { name: "Open navigation menu", exact: true }).waitFor()
      await page.evaluate(() => document.fonts.ready)
      const label = `${engine.name()}-${width}-${text}`
      const snapshot = engine === webkit && text === "comfortable" && [390,1440].includes(width)
      const checkOverflow = async selector => assert.deepEqual(await page.locator(selector).evaluateAll(elements => elements.filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.className)), [], `${label}: overflow ${selector}`)
      await checkOverflow(".lux-header")
      if (snapshot && width === 390) await page.screenshot({ path: `${output}/mobile-collapsed.png`, animations: "disabled" })
      const open = async () => { await page.getByRole("button", { name: "Open navigation menu", exact: true }).click(); await page.locator('.ccnav-drawer').waitFor(); await page.waitForTimeout(240) }
      await open()
      await checkOverflow(".ccnav-drawer, .ccnav-drawer-scroll, .ccnav-group button")
      assert.equal(await page.locator('.ccnav-group button[aria-current="page"]').innerText(), "home\nHome\n↗")
      assert.ok(await page.evaluate(() => document.getElementById("root").inert))
      // A keyboard user must never fall through to the background dock.
      await page.keyboard.press("Shift+Tab")
      assert.equal(await page.evaluate(() => document.activeElement.textContent.includes("Developers")), true)
      await page.keyboard.press("Tab")
      assert.equal(await page.getByRole("button", { name: "Close navigation menu" }).evaluate(e => e === document.activeElement), true)
      if (snapshot) await page.screenshot({ path: `${output}/${width === 390 ? "mobile" : "desktop"}-expanded.png`, animations: "disabled" })
      await page.getByRole("button", { name: "About the App", exact: true }).click()
      await page.getByRole("dialog", { name: "About the App", exact: true }).waitFor()
      await checkOverflow(".ccnav-page-scroll, .ccnav-information, .ccnav-page-actions")
      // The real dock must be behind the new page, never painted over its controls.
      assert.ok(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight - 30)?.closest('.ccnav-layer')))
      if (snapshot) await page.screenshot({ path: `${output}/${width === 390 ? "mobile" : "desktop"}-about.png`, animations: "disabled" })
      await page.getByRole("button", { name: /Meet the developers/ }).click()
      await checkOverflow(".ccnav-page-scroll, .ccnav-person, .ccnav-person a")
      assert.equal(await page.locator(".ccnav-person").count(), 5)
      assert.equal(await page.locator('.ccnav-person a[href^="mailto:"]').count(), 5)
      assert.ok(!(await page.locator(".ccnav-team").textContent()).includes("Jacob"))
      for (const img of await page.locator('.ccnav-person img').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(img => img.decode()) }
      await page.locator('.ccnav-page-scroll').evaluate(e => { e.scrollTop = 0 })
      if (snapshot) await page.screenshot({ path: `${output}/${width === 390 ? "mobile" : "desktop"}-developers.png`, animations: "disabled" })
      await page.locator('.ccnav-page-scroll').evaluate(e => { e.scrollTop = 100 })
      await open()
      assert.equal(await page.getByRole("button", { name: "Developers", exact: true }).getAttribute("aria-current"), "page")
      await page.keyboard.press("Escape")
      await page.locator('.ccnav-drawer').waitFor({ state: "detached" })
      assert.equal(await page.getByRole("dialog", { name: "Developers", exact: true }).count(), 1)
      assert.equal(await page.locator('.ccnav-page-scroll').evaluate(e => e.scrollTop), 100, "Closing the drawer reset the information page's reading position")
      // Valid native Back closes only the information page, preserving the tab.
      await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" }, source: window.parent })))
      await page.locator('.ccnav-layer').waitFor({ state: "detached" })
      assert.equal(await page.evaluate(() => document.getElementById("root").inert), false)
      assert.equal(await page.locator('.lux-nav [data-nav="home"]').getAttribute("aria-current"), "page")
      for (const [name, tab] of [["Shop furniture", "shop"], ["Wishlist", "saved"], ["Shopping bag", "bag"], ["My account", "account"]]) {
        await open(); await page.getByRole("button", { name, exact: true }).click()
        await page.locator('.ccnav-layer').waitFor({ state: "detached" })
        assert.equal(await page.locator(`.lux-nav [data-nav="${tab}"]`).getAttribute("aria-current"), "page")
      }
      // Rapid clicks, background protections, support/rewards/order entry points.
      for (const [name, selector] of [["My orders", ".account-sheet"], ["Care & support", ".account-sheet"], ["Home Circle", ".home-circle"]]) {
        await open(); await page.getByRole("button", { name, exact: true }).click(); await page.locator(selector).waitFor()
        await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" }, source: window.parent })))
        await page.locator(selector).waitFor({ state: "detached" })
      }
      assert.deepEqual(errors, [], label)
      checked++
      console.log(`PASS ${label}`)
      await context.close()
    }
  }
  await browser.close()
}
console.log(`PASS: ${checked} full-app menu/layout combinations, all destinations, contacts/photos, focus/Back, reduced motion, and dock layering.`)

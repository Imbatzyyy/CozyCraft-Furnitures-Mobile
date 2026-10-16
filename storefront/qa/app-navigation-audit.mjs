// Full app/router, intercepted backend. No real accounts or external writes.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.APP_URL || "http://127.0.0.1:5197"
const output = process.env.QA_OUTPUT || "/tmp/cozycraft-menu-qa"
const quick = process.env.QA_QUICK === "1"
await mkdir(output, { recursive: true })
const id = "11111111-1111-4111-8111-111111111111"
const user = { id, email: "qa@example.test", role: "authenticated", aud: "authenticated", created_at: "2026-01-01", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "Alex Rivera", cozy_tour_completed_v1: true }, factors: [] }
const profile = { id, role: "customer", full_name: "Alexandra Rivera Santos", email: "alexandra.rivera.long.address@example.test", phone: "+639171234567", username: "alex.rivera", avatar_url: "" }
let checked = 0
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true })
  for (const [width, height] of quick ? [[390,844]] : [[320,640], [390,844], [768,1024], [844,390], [1440,1000]]) {
    for (const text of quick ? ["comfortable"] : ["comfortable", "extra-large"]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: width === 320 ? "reduce" : "no-preference" })
      const contentReads = new Map()
      await context.routeWebSocket(/supabase\.(co|in)/, ws => ws.close())
      await context.route(/https:\/\/[^/]*supabase\.(co|in)\//, async route => {
        const req = route.request(), path = new URL(req.url()).pathname
        if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } })
        let data = []
        if (path === "/auth/v1/user") data = user
        else if (path === "/rest/v1/profiles") data = req.headers().accept?.includes("object") ? profile : [profile]
        else if (path === "/rest/v1/products") data = [{ id: "qa-sofa", name: "CozyCraft sofa", category: "Living room", price: 12000, stock_quantity: 10, status: "active", images: [`${base}/furniture/photo-1599696848652-f0ff23bc911f.jpg`], rating: 5, review_count: 1 }]
        else if (path === "/rest/v1/store_settings") { const settings = { id: true, account_settings: {}, checkout_settings: {}, fulfillment_settings: {}, contact_email: "care@example.test", support_phone: "+639171234567" }; data = req.headers().accept?.includes("object") ? settings : [settings] }
        else if (path === "/rest/v1/content_pages") {
          const slug = new URL(req.url()).searchParams.get("slug")?.replace("eq.", "")
          contentReads.set(slug, (contentReads.get(slug) || 0) + 1)
          data = { slug, title: slug === "contact" ? "Contact CozyCraft" : `${slug === "privacy" ? "Privacy Policy" : "Terms of Service"}`, summary: "Current CozyCraft information.", body: slug === "contact" ? "BUSINESS EMAIL\ncare@example.test\n\nCUSTOMER CARE HOURS\nMonday to Saturday · 9:00 AM–6:00 PM Philippine Time" : "YOUR INFORMATION\nThis is the controlled QA policy, not production legal text.", updated_at: "2026-10-15T00:00:00Z" }
        }
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
      await page.locator('.lux-nav [data-nav="home"]').waitFor()
      await page.evaluate(() => document.fonts.ready)
      const label = `${engine.name()}-${width}-${text}`
      const checkOverflow = async selector => assert.deepEqual(await page.locator(selector).evaluateAll(elements => elements.filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.className)), [], `${label}: overflow ${selector}`)
      const noMenu = async () => {
        assert.equal(await page.getByRole("button", { name: /navigation menu/i }).count(), 0, label)
        assert.equal(await page.locator(".ccnav-trigger, .ccnav-drawer, .ccnav-overlay").count(), 0, label)
      }
      await noMenu()
      await checkOverflow(".lux-header")
      if (engine === webkit && width === 390 && text === "comfortable") await page.screenshot({ path: `${output}/no-menu-home.png`, animations: "disabled" })
      // Main destinations remain available without the drawer.
      for (const tab of ["shop", "saved", "bag", "account"]) {
        await page.locator(`.lux-nav [data-nav="${tab}"]`).click()
        assert.equal(await page.locator(`.lux-nav [data-nav="${tab}"]`).getAttribute("aria-current"), "page")
        await noMenu()
      }
      const links = page.locator(".account-resource-links")
      await links.scrollIntoViewIfNeeded()
      await checkOverflow(".account-resource-links, .account-resource-links button")
      const layout = await links.evaluate(el => {
        const box = name => { const button = [...el.querySelectorAll("button")].find(b => b.textContent === name); const r = button.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } }
        return { privacy: box("Privacy"), history: box("Company History"), terms: box("Terms"), touch: [...el.querySelectorAll("button")].every(b => b.getBoundingClientRect().height >= 44) }
      })
      assert.ok(layout.touch)
      assert.ok(Math.abs(layout.history.y - layout.terms.y) < 2, label + ": history and terms must share a row")
      assert.ok(layout.privacy.y >= Math.max(layout.history.bottom, layout.terms.bottom), label + ": Privacy must be underneath")
      assert.ok(Math.abs(layout.privacy.x + layout.privacy.width / 2 - (layout.history.x + layout.terms.x + layout.terms.width) / 2) < 2, label + ": Privacy must be centered")
      assert.ok(Math.abs(layout.privacy.width - layout.history.width) < 2, label + ": Privacy must keep the matching button width")
      if (engine === webkit && width === 390 && text === "comfortable") await page.screenshot({ path: `${output}/no-menu-account.png`, animations: "disabled" })
      for (const [index, [name, selector]] of [["About", ".ccnav-brand-card"], ["Contact Us", ".ccnav-contact-actions"], ["Developers", ".ccnav-team"], ["Company History", ".ccnav-timeline"], ["Terms", ".ccnav-policy"], ["Privacy", ".ccnav-policy"]].entries()) {
        const link = links.getByRole("button", { name, exact: true })
        await link.scrollIntoViewIfNeeded()
        // Safari does not focus buttons on pointer click. Focus deliberately
        // to verify the keyboard return target rather than assuming it does.
        await link.focus()
        await link.evaluate(el => el.addEventListener("click", () => { window.__accountScrollAtOpen = document.querySelector(".lux-body").scrollTop }, { once: true }))
        await link.press("Enter")
        await page.locator(selector).waitFor()
        await noMenu()
        assert.equal(await page.locator(".ccnav-page").count(), 1)
        assert.ok(await page.evaluate(() => document.getElementById("root").inert))
        await checkOverflow(".ccnav-page-header, .ccnav-page-scroll, .ccnav-information, .ccnav-person, .ccnav-contact-actions")
        await page.keyboard.press("Shift+Tab")
        assert.ok(await page.evaluate(() => !!document.activeElement.closest(".ccnav-page")), label + ": modal must retain focus")
        if (name === "Developers") {
          assert.equal(await page.locator(".ccnav-person").count(), 5)
          assert.equal(await page.locator('.ccnav-person a[href^="mailto:"]').count(), 5)
          assert.equal(await page.locator(".ccnav-person-description").count(), 5)
          assert.ok((await page.locator(".ccnav-team").innerText()).includes("Jacob Christopher Cañete"))
          assert.ok(!(await page.locator(".ccnav-team").innerText()).match(/samm?uel|qsgconcepcion/i))
          for (const img of await page.locator(".ccnav-person img").all()) {
            await img.scrollIntoViewIfNeeded()
            await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle())
          }
          const jacob = page.locator(".ccnav-person").filter({ hasText: "Jacob Christopher Cañete" })
          assert.equal(await jacob.getByRole("link", { name: /qjcanete02@tip.edu.ph/ }).getAttribute("href"), "mailto:qjcanete02@tip.edu.ph")
          await jacob.scrollIntoViewIfNeeded()
          if (engine === webkit && width === 390 && text === "comfortable") await page.screenshot({ path: `${output}/no-menu-developers.png`, animations: "disabled" })
        }
        if (name === "Contact Us") assert.equal(await page.getByRole("link", { name: /Email customer care/ }).getAttribute("href"), "mailto:care@example.test")
        if (index % 3 === 0) await page.keyboard.press("Escape")
        else if (index % 3 === 1) await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: { type: "cozycraft-native-back" }, source: window.parent })))
        else await page.getByRole("button", { name: "Back to shopping screen" }).click()
        await page.locator(".ccnav-layer").waitFor({ state: "detached" })
        assert.equal(await page.evaluate(() => document.getElementById("root").inert), false)
        assert.equal(await page.locator('.lux-nav [data-nav="account"]').getAttribute("aria-current"), "page", label + ": returned from " + name)
        assert.equal(await page.locator(".lux-body").evaluate(el => el.scrollTop), await page.evaluate(() => window.__accountScrollAtOpen), label + ": return scroll")
        assert.ok(await link.evaluate(el => document.activeElement === el), label + ": restored keyboard focus from " + name)
      }
      // Rapid presses must open one layer, not duplicate a page or drawer.
      await links.getByRole("button", { name: "Terms", exact: true }).evaluate(el => { el.click(); el.click(); el.click() })
      await page.locator(".ccnav-policy").waitFor()
      assert.equal(await page.locator(".ccnav-page").count(), 1)
      assert.equal(contentReads.get("terms"), 1, "Policy reopening must use the existing cache")
      await page.getByRole("button", { name: "Back to shopping screen" }).click()
      await noMenu()
      assert.deepEqual(errors, [], label)
      checked++
      console.log(`PASS ${label}: no drawer; centered Privacy; six information pages; Jacob; focus/Back/cache`)
      await context.close()
    }
  }
  await browser.close()
}
console.log(`PASS: ${checked} no-menu full-app layouts, all Account information pages, Jacob photo, bottom tabs, centered Privacy, focus/Back, and policy cache.`)

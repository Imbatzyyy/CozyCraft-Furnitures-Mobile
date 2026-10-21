// Exercise the real storefront inside an iframe: standalone haptics are a no-op.
// All backend traffic is intercepted; this test never creates live account data.
import assert from "node:assert/strict"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.APP_URL || "http://127.0.0.1:5197"
const user = {
  id: "11111111-1111-4111-8111-111111111111", email: "qa@example.test",
  role: "authenticated", aud: "authenticated", created_at: "2026-01-01",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Alex Rivera", cozy_tour_completed_v1: true }, factors: [],
}
const host = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block}</style></head><body>
<script>
window.hapticMessages = [];
window.addEventListener("message", event => {
  if (event.source !== document.querySelector("iframe")?.contentWindow) return;
  if (event.data?.type === "cozycraft-haptic") window.hapticMessages.push(event.data);
  if (event.data?.type === "qa-haptic-flush") window.hapticFlush = event.data.id;
});
<\/script><iframe title="CozyCraft storefront" src="/#/shop"></iframe></body></html>`
let checked = 0
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion,
      })
      try {
        await context.routeWebSocket(/supabase\.(co|in)/, socket => socket.close())
        await context.route(/https:\/\/[^/]*supabase\.(co|in)\//, async route => {
          const req = route.request(), path = new URL(req.url()).pathname
          if (req.method() === "OPTIONS") return route.fulfill({
            status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" },
          })
          let data = []
          const object = value => req.headers().accept?.includes("object") ? value : [value]
          if (path === "/auth/v1/user") data = user
          else if (path === "/rest/v1/profiles") data = object({
            id: user.id, role: "customer", full_name: "Alex Rivera", email: user.email, username: "alex.rivera", avatar_url: "",
          })
          else if (path === "/rest/v1/store_settings") data = object({
            id: true, account_settings: {}, checkout_settings: {}, fulfillment_settings: {},
          })
          else if (path.endsWith("/get_mobile_customer_onboarding")) data = {
            userId: user.id, isGoogle: false, needsUsername: false, showVoucher: false, voucher: null,
          }
          else if (path.endsWith("/touch_customer_device_session")) data = true
          else if (path.startsWith("/functions/")) data = {}
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) })
        })
        await context.route(base + "/__haptic-audit", route => route.fulfill({ contentType: "text/html", body: host }))
        await context.addInitScript(({ user, platform }) => {
          const now = Math.floor(Date.now() / 1000)
          const token = [{ alg: "HS256", typ: "JWT" }, {
            sub: user.id, exp: now + 3600, iat: now, role: "authenticated", aal: "aal1",
            amr: [{ method: "password", timestamp: now }], session_id: "22222222-2222-4222-8222-222222222222",
          }].map(value => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")).join(".") + ".qa-signature"
          localStorage.setItem("sb-gwjsivqksyimuabbdyqq-auth-token", JSON.stringify({
            user, access_token: token, refresh_token: "qa-only", expires_at: now + 3600, expires_in: 3600, token_type: "bearer",
          }))
          document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add(...platform))
        }, { user, platform: engine === webkit ? ["cozy-platform-ios", "cozy-platform-ios26"] : ["cozy-platform-android"] })
        const page = await context.newPage()
        const errors = []
        page.on("pageerror", error => errors.push(error.message))
        await page.goto(base + "/__haptic-audit")
        const app = page.frameLocator("iframe")
        await app.locator('.lux-nav [data-nav="home"]').waitFor()
        // Ensure capture is active and source-window filtering accepts the child.
        await app.locator("body").evaluate(() => window.parent.postMessage({ type: "cozycraft-haptic", kind: "qa-probe" }, "*"))
        await page.waitForFunction(() => window.hapticMessages.some(message => message.kind === "qa-probe"))
        await page.evaluate(() => { window.hapticMessages = [] })
        let flushId = 0
        const quiet = async label => {
          const id = ++flushId
          await app.locator("body").evaluate((_, id) => window.parent.postMessage({ type: "qa-haptic-flush", id }, "*"), id)
          await page.waitForFunction(id => window.hapticFlush === id, id)
          assert.deepEqual(await page.evaluate(() => window.hapticMessages), [], label)
        }
        const label = engine.name() + " / " + reducedMotion
        // First repeat the already-selected tab; then switch and repeat every tab.
        for (const tab of ["home", "shop", "saved", "bag", "account", "home"]) {
          const button = app.locator('.lux-nav [data-nav="' + tab + '"]')
          for (let repeat = 0; repeat < 3; repeat++) {
            await button.tap()
            assert.equal(await button.getAttribute("aria-current"), "page", label + ": " + tab)
            await quiet(label + ": tapping " + tab + " must not vibrate")
          }
          // Same-frame clicks reproduce impatient repeated taps.
          await button.evaluate(button => { button.click(); button.click(); button.click() })
          assert.equal(await button.getAttribute("aria-current"), "page")
          await quiet(label + ": rapid repeated " + tab)
        }
        await app.locator(".lux-nav").evaluate(nav => {
          for (const tab of ["shop", "saved", "bag", "account", "home"]) {
            nav.querySelector('[data-nav="' + tab + '"]').click()
          }
        })
        await quiet(label + ": rapid switching")
        assert.equal(await app.locator('[data-nav="home"]').getAttribute("aria-current"), "page")
        assert.deepEqual(errors, [], label + ": browser errors")
        checked++
        console.log("PASS " + label + ": tab switches, reselected tabs, rapid taps; zero native haptic requests")
      } finally { await context.close() }
    }
  } finally { await browser.close() }
}
console.log("PASS: " + checked + " embedded storefront touch-navigation checks")

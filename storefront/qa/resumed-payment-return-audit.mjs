import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5187"
const order = "11111111-1111-4111-8111-111111111111"
if (process.env.QA_OUTPUT) await mkdir(process.env.QA_OUTPUT, { recursive: true })
let checks = 0
for (const [engine, type] of Object.entries({ chromium, webkit })) {
  const browser = await type.launch({ headless: true })
  try {
    for (const detail of [false, true]) for (const payment of ["success", "cancelled"]) {
      const page = await browser.newPage({ viewport: { width: detail ? 320 : 393, height: detail ? 568 : 852 }, reducedMotion: detail ? "reduce" : "no-preference" })
      const errors = []
      page.on("pageerror", error => errors.push(error.message))
      await page.route("**/*", route => {
        if (!route.request().url().startsWith(origin)) return route.abort()
        if (route.request().url() === `${origin}/native-fixture`) return route.fulfill({ contentType: "text/html", body: `<iframe title="CozyCraft" style="position:fixed;inset:0;width:100%;height:100%;border:0" src="/?shell&payment-return-qa"></iframe><script>window.events=[];addEventListener('message',e=>window.events.push(e.data));</script>` })
        return route.continue()
      })
      await page.goto(`${origin}/native-fixture`)
      const app = page.frameLocator("iframe")
      await app.locator('[data-nav="account"]').click()
      await app.getByRole("button", { name: /My orders/ }).click()
      if (detail) await app.getByRole("button", { name: /View complete order/ }).click()
      await app.getByRole("button", { name: /Continue payment/ }).click()
      await page.waitForFunction(() => window.events.some(e => e.type === "cozycraft-open-paymongo"))
      const opened = await page.evaluate(() => window.events.find(e => e.type === "cozycraft-open-paymongo"))
      assert.equal(opened.orderId, order)
      const url = `com.cozycraft.furniture://payment/return?payment=${payment}&order=${order}`
      await page.evaluate(url => document.querySelector('iframe').contentWindow.postMessage({ type: "cozycraft-payment-callback", url }, '*'), url)
      if (payment === "success") {
        const confirmation = app.getByRole("dialog", { name: "Order placed", exact: true })
        await confirmation.waitFor({ state: "visible", timeout: 800 })
        assert.equal(await app.locator('.account-sheet-portal').count(), 0, 'Orders must be unmounted in the same transition, not cover confirmation')
        assert.equal(await app.locator('.order-detail-view').count(), 0)
        assert.match(await confirmation.innerText(), /CC-01999/)
        const target = confirmation.getByRole("button", { name: "View order details" })
        // Trial click checks actual hit testing, including stacking/overlays.
        await target.click({ trial: true })
        if (process.env.QA_OUTPUT) await page.screenshot({ path: `${process.env.QA_OUTPUT}/${engine}-${detail ? 'details' : 'list'}.png`, fullPage: true })
        await page.evaluate(url => {
          const app = document.querySelector('iframe').contentWindow
          for (let i = 0; i < 3; i++) app.postMessage({ type: "cozycraft-payment-callback", url }, '*')
          app.postMessage({ type: "cozycraft-paymongo-dismissed" }, '*')
        }, url)
        await page.waitForTimeout(1200)
        assert.equal(await app.getByRole("dialog", { name: "Order placed", exact: true }).count(), 1)
        assert.equal(await app.locator('.account-sheet-portal').count(), 0)
        if (detail) {
          await target.click()
          await app.getByRole("dialog", { name: "Order CC-01999 details", exact: true }).waitFor({ state: "visible" })
        } else {
          await confirmation.getByRole("button", { name: "Continue browsing" }).click()
          await app.getByRole("button", { name: /My orders/ }).waitFor({ state: "visible" })
          assert.equal(await app.locator('.account-sheet-portal').count(), 0, 'Leaving confirmation must not revive the old Orders dialog')
        }
        await page.waitForTimeout(250)
        assert.equal(await app.getByRole("dialog", { name: "Order placed", exact: true }).count(), 0)
        // A repeated native callback after leaving confirmation must not reopen it.
        await page.evaluate(url => document.querySelector('iframe').contentWindow.postMessage({ type: "cozycraft-payment-callback", url }, '*'), url)
        await page.waitForTimeout(100)
        assert.equal(await app.getByRole("dialog", { name: "Order placed", exact: true }).count(), 0)
      } else {
        await app.getByRole("dialog", { name: "Order CC-01999 details", exact: true }).waitFor({ state: "visible" })
        assert.equal(await app.getByRole("dialog", { name: "Order placed", exact: true }).count(), 0)
        assert.equal(await app.getByRole("button", { name: /Continue payment/ }).count(), 1)
      }
      assert.deepEqual(errors, [])
      console.log(`PASS ${engine}: ${detail ? 'order details' : 'orders list'} → ${payment}`)
      checks++
      await page.close()
    }
  } finally { await browser.close() }
}
console.log(`PASS: ${checks} actual Storefront resumed-payment return journeys.`)

import assert from "node:assert/strict"
const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5187"
let checks = 0
for (const engine of ["chromium", "webkit"]) {
  const browser = await playwright[engine].launch({ headless: true })
  try {
    for (const platform of ["ios", "android"]) for (const [width, height] of [[320, 568], [390, 844], [430, 932], [768, 1024], [844, 390]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" })
      const errors = []
      const external = []
      page.on("pageerror", error => errors.push(error.message))
      await page.route("**/*", route => {
        if (!route.request().url().startsWith(origin) && !route.request().url().startsWith("data:")) {
          external.push(route.request().url()); return route.abort()
        }
        return route.continue()
      })
      await page.goto(`${origin}/?order-payments&platform=${platform}&text=extra-large`)
      const card = page.getByLabel("Order payment window")
      await card.waitFor()
      assert.equal(await page.getByRole("timer").count(), 1)
      const before = await page.getByRole("timer").textContent()
      await page.waitForTimeout(1100)
      assert.notEqual(await page.getByRole("timer").textContent(), before)
      await page.getByRole("button", { name: "Continue payment", exact: true }).click()
      await page.getByRole("alert").waitFor()
      assert.match(await page.getByRole("alert").textContent(), /temporarily unavailable/)
      assert.equal(await page.getByRole("dialog", { name: "Order CC-01999 details" }).count(), 0)
      await page.getByRole("button", { name: /View complete order/ }).click()
      await page.getByRole("dialog", { name: "Order CC-01999 details" }).waitFor()
      assert.equal(await page.getByLabel("Order payment window").count(), 1)
      await page.getByRole("button", { name: "Continue payment", exact: true }).scrollIntoViewIfNeeded()
      const overflow = await page.evaluate(() => {
        const panel = document.querySelector(".order-payment-window")
        const detail = document.querySelector(".order-detail-view")
        const rect = panel.getBoundingClientRect()
        return { panel: panel.scrollWidth - panel.clientWidth, detail: detail.scrollWidth - detail.clientWidth, left: rect.left, right: rect.right, width: innerWidth }
      })
      assert(overflow.panel <= 1 && overflow.detail <= 1 && overflow.left >= 0 && overflow.right <= overflow.width + 1, JSON.stringify({ engine, platform, width, overflow }))
      const button = await page.getByRole("button", { name: "Continue payment", exact: true }).boundingBox()
      assert(button.height >= 44)
      if (engine === "webkit" && platform === "ios" && width === 390 && process.env.QA_OUTPUT) {
        await page.screenshot({ path: `${process.env.QA_OUTPUT}/payment-details-iphone.png` })
      }
      await page.evaluate(() => dispatchEvent(new CustomEvent("qa-payment-state", { detail: "paid" })))
      await card.waitFor({ state: "detached" })
      assert.equal(await page.locator(".order-detail-status").textContent(), "Processing")
      assert.equal(external.length, 0, "The isolated fixture must not make production requests")
      assert.deepEqual(errors, [])
      checks++
      await page.close()
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(`${origin}/?order-payments&near-expiry`)
    await page.getByText("Checking the final status.").waitFor()
    assert.equal(await page.getByRole("button", { name: "Continue payment", exact: true }).count(), 0)
    await page.getByRole("button", { name: /View complete order/ }).click()
    await page.evaluate(() => dispatchEvent(new CustomEvent("qa-payment-state", { detail: "expired" })))
    await page.getByText("Your reservation has ended.").waitFor()
    assert.equal(await page.locator(".order-detail-status").textContent(), "Payment expired")
    await page.close()
    checks++
  } finally { await browser.close() }
}
console.log(`PASS: ${checks} payment layouts/journeys in Chromium and WebKit; large text, short landscape, local countdown, errors, realtime settlement, deadline and server expiry. No production requests.`)

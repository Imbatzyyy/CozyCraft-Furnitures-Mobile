import assert from "node:assert/strict"
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) })
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5187"
try {
  for (const width of [320, 390, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(`${origin}/?motion&text=extra-large`)
    await page.locator(".cozy-loader__sofa").first().waitFor()
    assert.equal(await page.locator(".cozy-loader__cushions").first().evaluate(el => getComputedStyle(el).animationName), "cozy-cushion-settle")
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Loader must fit the viewport")
    await page.emulateMedia({ reducedMotion: "reduce" })
    assert.equal(await page.locator(".cozy-loader__cushions").first().evaluate(el => getComputedStyle(el).animationName), "none")
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await page.evaluate(() => { document.documentElement.dataset.cozyMotion = "economy" })
    assert.equal(await page.locator(".cozy-loader__cushions").first().evaluate(el => getComputedStyle(el).animationName), "none")
    if (width === 390) await page.screenshot({ path: "/tmp/cozycraft-sofa-loading.png" })
    await page.goto(`${origin}/?product&platform=ios`)
    await page.locator(".detail-sheet").waitFor()
    await page.waitForTimeout(300)
    assert.equal(await page.locator(".detail-sheet").evaluate(el => getComputedStyle(el).transform), "none", "Page transition must release its transform for fixed children")
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log("Motion audit passed: 320, 390, and 768px; sofa rendering, reduced motion, economy mode, and page transform cleanup.")
} finally { await browser.close() }

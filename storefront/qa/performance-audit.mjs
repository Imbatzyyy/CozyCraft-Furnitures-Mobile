// Local fixture regression under normal and slowed CPU. Not a phone benchmark.
import assert from "node:assert/strict"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5187"
let cases = 0
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  try {
    for (const rate of engine === chromium ? [1, 6] : [1]) {
      const page = await browser.newPage({ viewport: { width: 320, height: 640 }, reducedMotion: "reduce" })
      if (engine === chromium) {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send("Emulation.setCPUThrottlingRate", { rate })
      }
      for (const route of ["product", "account=orders", "account=support", "checkout", "membership", "care", "range"]) {
        const errors = []
        const onError = error => errors.push(error.message)
        page.on("pageerror", onError)
        await page.goto(`${origin}/?${route}&text=extra-large`)
        await page.locator("button").first().waitFor()
        await page.waitForTimeout(500)
        await page.evaluate(() => {
          for (const element of document.querySelectorAll("section,main,.lux-phone")) {
            if (element.scrollHeight > element.clientHeight) element.scrollTop = Math.min(400, element.scrollHeight)
          }
        })
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}: page overflow`)
        assert.deepEqual(errors, [], `${route}: runtime errors at ${rate}x CPU`)
        page.off("pageerror", onError)
        cases++
      }
      await page.close()
    }
  } finally { await browser.close() }
}
console.log(`PASS ${cases} fixture checks: Chromium normal/6x slowed CPU and WebKit, narrow viewport and extra-large text. Not a physical-device benchmark.`)

import assert from "node:assert/strict"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  for (const width of [320, 390, 768]) {
    let previousFont = 0
    for (const size of ["standard", "comfortable", "large", "extra-large"]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
      await page.goto(`http://127.0.0.1:5187/?account=support&text=${size}`)
      const sheet = page.locator(".account-sheet")
      await sheet.waitFor()
      for (const top of [400, 750, 1100]) {
        await sheet.evaluate((element, value) => { element.scrollTop = value }, top)
        const button = page.getByRole("button", { name: "Back to previous page" })
        await button.waitFor()
        await page.waitForTimeout(100)
        const rect = await button.boundingBox()
        assert(rect && rect.x >= 0 && rect.x + rect.width <= width)
        assert(Math.abs(rect.y + rect.height - 826) <= 2, "Back must stay 18px above viewport bottom")
        assert.equal(await button.evaluate(el => getComputedStyle(el).borderRadius), "999px")
      }
      if (engine === webkit && width === 390 && size === "extra-large") await page.screenshot({ path: "/tmp/cozy-support-back-fixed.png" })
      // Use the production badge markup and styles, with the longest displayed count.
      await page.evaluate(() => {
        const fixture = document.createElement("div")
        fixture.id = "badge-fixture"
        fixture.className = "lux-header"
        fixture.innerHTML = '<button class="round-icon notification-trigger"><span class="material-symbols-rounded">notifications</span><i><span>99</span></i></button>'
        document.body.append(fixture)
      })
      const badge = await page.locator("#badge-fixture i span").evaluate(el => {
        const number = el.getBoundingClientRect(), circle = el.parentElement.getBoundingClientRect()
        return { font: parseFloat(getComputedStyle(el).fontSize), fits: number.width <= circle.width && number.height <= circle.height }
      })
      assert(badge.fits)
      assert(badge.font > previousFont, "Badge numbers must scale with every text preference")
      previousFont = badge.font
      await page.locator("#badge-fixture").evaluate(el => el.remove())
      await page.getByRole("button", { name: "Back to previous page" }).click()
      await sheet.waitFor({ state: "detached" })
      await page.close()
    }
  }
  await browser.close()
}
console.log("PASS 24 responsive/text-size cases: badge scaling and fit, stable Back at three scroll positions, return to profile.")

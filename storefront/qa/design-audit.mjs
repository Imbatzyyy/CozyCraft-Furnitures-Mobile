// Start `npm run qa -- --port 5187` first. PLAYWRIGHT_MODULE may point at a
// preinstalled Playwright runtime. This suite uses local fixtures only.
import assert from "node:assert/strict"
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) })
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5187"
const sizes = [[320, 640], [390, 844], [768, 1024], [844, 390]]
const fixtures = ["profile", "checkout", "payment", "google-onboarding=voucher", "account", "account=support", "account=payments", "account=orders", "product", "notifications"]
let checked = 0
try {
  for (const [width, height] of sizes) for (const text of ["standard", "comfortable", "large", "extra-large"]) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    for (const fixture of fixtures) {
      await page.goto(`${origin}/?${fixture}&text=${text}`)
      await page.waitForTimeout(150)
      if (fixture === "account=orders") await page.getByRole("button", { name: "View complete order" }).click()
      if (fixture === "checkout") await page.getByRole("button", { name: "Continue →", exact: true }).click()
      const overflow = await page.evaluate(() => {
        const rootOverflow = document.documentElement.scrollWidth > innerWidth
        const controls = [...document.querySelectorAll("button,input,h1,h2,p,small")].filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width && rect.height && rect.left >= 0 && rect.left < innerWidth && rect.right > innerWidth + 2
        }).map((element) => element.textContent?.slice(0, 60))
        return { rootOverflow, controls }
      })
      assert.deepEqual(overflow, { rootOverflow: false, controls: [] }, `${width}×${height} ${text} ${fixture}`)
      assert.deepEqual(errors, [], `${fixture}: runtime errors`)
      checked++
    }
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${origin}/?product`)
  await page.getByRole("button", { name: "Open review photo 1", exact: true }).click()
  await page.getByRole("button", { name: "Next photo" }).click()
  assert(await page.getByText("2 of 2").isVisible())
  await page.keyboard.press("Escape")
  assert(await page.getByRole("button", { name: "Open review photo 1", exact: true }).evaluate((e) => e === document.activeElement))
  await page.goto(`${origin}/?account`)
  await page.getByRole("button", { name: /Text size/ }).click()
  await page.getByRole("radio", { name: /Extra large/ }).click()
  const dialog = page.getByRole("dialog", { name: "Choose your text size." })
  const last = dialog.getByRole("button", { name: "Done", exact: true })
  await last.focus()
  await page.keyboard.press("Tab")
  assert(await dialog.getByRole("button", { name: "Close text size settings" }).evaluate((e) => e === document.activeElement))
  await last.click()
  assert(await page.getByRole("button", { name: /Text size/ }).evaluate((e) => e === document.activeElement))
  await page.goto(`${origin}/?payment`)
  await page.getByRole("textbox").fill("012345")
  await page.getByRole("button", { name: "Verify and continue" }).click()
  assert(await page.getByText("Email confirmed", { exact: true }).isVisible())
  // A reduced viewport is a keyboard-space regression, not an OS keyboard test.
  await page.setViewportSize({ width: 390, height: 360 })
  await page.getByRole("button", { name: "Try secure checkout again" }).scrollIntoViewIfNeeded()
  assert(await page.getByRole("button", { name: "Try secure checkout again" }).isVisible())
  await page.close()
  console.log(`PASS: ${checked} responsive layouts; photo navigation and focus restoration; text-size focus containment; payment-code fixture and short viewport.`)
} finally {
  await browser.close()
}

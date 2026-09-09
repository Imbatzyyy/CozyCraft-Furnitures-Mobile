const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.QA_URL || "http://127.0.0.1:5189"
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" })
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    if (engine === chromium && width === 320) {
      const session = await page.context().newCDPSession(page)
      await session.send("Emulation.setCPUThrottlingRate", { rate: 6 })
    }
    await page.goto(`${base}/?tour&text=extra-large`)
    await page.getByRole("button", { name: "Show me around" }).click()
    for (let step = 0; step < 4; step++) {
      await page.locator(".welcome-tour-highlight").waitFor()
      const images = await page.locator(".welcome-tour img").evaluateAll((nodes) => nodes.every((node) => node.complete && node.naturalWidth > 0))
      if (!images) await page.waitForFunction(() => [...document.querySelectorAll(".welcome-tour img")].every((node) => node.complete && node.naturalWidth > 0))
      await page.getByRole("button", { name: step === 3 ? "Finish" : "Next", exact: false }).click()
    }
    await page.getByRole("dialog").waitFor({ state: "detached" })
    await page.reload()
    await page.waitForTimeout(300)
    if (await page.getByRole("dialog").count()) throw new Error("Completed tour repeated")
    await page.evaluate(() => window.dispatchEvent(new Event("cozycraft-replay-tour")))
    await page.getByRole("button", { name: "Skip tour" }).click()
    if (await page.getByRole("dialog").count()) throw new Error("Skip failed")
    if (errors.length) throw new Error(errors.join("\n"))
    console.log(`${engine.name()} ${width}x${height}: finish, persistence, replay, skip passed`)
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } })
  await page.goto(`${base}/?google-onboarding=voucher&text=extra-large`)
  await page.locator('img[src="./mascot/tour-voucher.png"]').waitFor()
  await page.getByRole("button", { name: /Keep it for later/ }).click()
  await page.getByRole("dialog").waitFor({ state: "detached" })
  console.log(`${engine.name()}: voucher artwork and dismissal passed`)
  await browser.close()
}

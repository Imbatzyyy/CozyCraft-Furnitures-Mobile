const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  for (const skip of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: "reduce" })
    await page.goto(`${process.env.QA_URL || "http://127.0.0.1:5190"}/?google-onboarding=username&welcome-flow&text=extra-large`)
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.getByLabel("Username", { exact: true }).fill("new.cozy")
    await page.getByRole("button", { name: /Continue to CozyCraft/ }).click()
    await page.getByText("Welcome home.").waitFor()
    if (await page.getByText("WELCOME-COZY2026").count()) throw new Error("Voucher opened before tour")
    if (skip) await page.getByText("Skip tour").click()
    else {
      await page.getByText("Show me around").click()
      for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "Next", exact: false }).click()
      await page.getByRole("button", { name: "Finish", exact: false }).click()
    }
    await page.getByText("WELCOME-COZY2026").waitFor()
    await page.waitForFunction(() => { const image = document.querySelector('img[src="./mascot/tour-voucher.png"]'); return image?.complete && image.naturalWidth > 0 })
    if (await page.getByRole("dialog").count() !== 1) throw new Error("Overlapping dialogs")
    await page.getByText("Keep it for later").click()
    await page.getByRole("dialog").waitFor({ state: "detached" })
    if (await page.locator("#root").evaluate((node) => node.inert)) throw new Error("Storefront remained inert")
    console.log(`${engine.name()}: Google setup → ${skip ? "Skip" : "Finish"} → voucher → interactive storefront PASS`)
    await page.close()
  }
  await browser.close()
}

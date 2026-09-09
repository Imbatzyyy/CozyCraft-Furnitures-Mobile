const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" })
    await page.goto(`${process.env.QA_URL || "http://127.0.0.1:5195"}/?google-onboarding=username&welcome-flow&text=extra-large`)
    const remount = async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("qa-onboarding-remount")))
      await page.getByRole("dialog").waitFor()
    }
    await page.getByLabel("First name", { exact: true }).fill("Prince Alex")
    await page.getByLabel("Last name", { exact: true }).fill("Balane")
    await remount()
    if (await page.getByLabel("First name", { exact: true }).inputValue() !== "Prince Alex") throw new Error("Name reset")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.getByLabel("Username", { exact: true }).fill("prince.home")
    for (let n = 0; n < 5; n++) {
      await remount()
      await page.setViewportSize({ width, height: n % 2 ? 844 : 450 })
      if (await page.getByLabel("Username", { exact: true }).inputValue() !== "prince.home") throw new Error("Step/username reset")
      if (await page.getByRole("dialog").count() !== 1) throw new Error("Duplicate dialog")
    }
    await page.setViewportSize({ width, height: 844 })
    await page.getByRole("button", { name: /Back/ }).click()
    if (await page.getByLabel("First name", { exact: true }).inputValue() !== "Prince Alex") throw new Error("Back lost name")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.screenshot({ path: `/tmp/cozy-google-setup-${engine.name()}-${width}.png` })
    await page.getByRole("button", { name: /Continue to CozyCraft/ }).click()
    await page.getByText("Welcome home.").waitFor()
    await page.getByText("Skip tour").click()
    await page.getByText("WELCOME-COZY2026").waitFor()
    console.log(`${engine.name()} ${width}px: edited names, five remounts, keyboard-sized viewport, Back, username, tutorial, voucher PASS`)
    await page.close()
  }
  await browser.close()
}

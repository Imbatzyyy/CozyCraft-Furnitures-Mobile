const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
for (const engine of [chromium, webkit]) {
  const b = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion })
    await p.goto(`${process.env.QA_URL || "http://127.0.0.1:5194"}/?tour`)
    await p.evaluate(() => {
      document.documentElement.classList.add("cozy-platform-ios26")
      const nav = document.querySelector("nav")
      nav.classList.add("lux-nav")
      const lens = document.createElement("span"); lens.className = "lux-nav-lens"; nav.prepend(lens)
    })
    await p.getByText("Show me around").click()
    const titles = ["Discover your cozy.", "Keep your favorites.", "Your shopping bag.", "Your own space."]
    for (let step = 0; step < 4; step++) {
      await p.getByText(titles[step], { exact: true }).waitFor()
      await p.waitForTimeout(310)
      if (await p.locator(".welcome-tour-highlight").count() !== 1) throw new Error("Duplicate spotlight")
      if (await p.locator(".lux-nav-lens").isVisible()) throw new Error("Duplicate glass lens visible")
      if (await p.locator("button[data-nav]").count() !== 5) throw new Error("Duplicated navigation")
      await p.locator(".tour-next").evaluate((button) => { for (let n = 0; n < 25; n++) button.click() })
      if (step < 3) await p.getByText(titles[step + 1], { exact: true }).waitFor()
    }
    await p.getByRole("dialog").waitFor({ state: "detached" })
    await p.waitForTimeout(350)
    if (await p.getByRole("dialog").count()) throw new Error("Tour restarted")
    if (await p.locator("html").evaluate((node) => node.classList.contains("cozy-tour-open"))) throw new Error("Tour style leaked")
    console.log(`${engine.name()} ${reducedMotion}: 25-click bursts, single spotlight, lens cleanup PASS`)
    await p.close()
  }
  await b.close()
}

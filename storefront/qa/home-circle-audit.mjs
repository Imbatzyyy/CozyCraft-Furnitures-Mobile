import assert from 'node:assert/strict'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')

let checked = 0
for (const [engine, platform] of [[chromium, 'android'], [webkit, 'ios']]) {
  const browser = await engine.launch({ headless: true, ...(platform === 'android' ? { channel: 'chrome' } : {}) })
  for (const [width, height] of [[320,640],[390,844],[768,1024],[844,390]]) {
    for (const text of ['standard','comfortable','large','extra-large']) {
      const page = await browser.newPage({ viewport: { width,height } })
      await page.goto(`http://127.0.0.1:5187/?membership&platform=${platform}&text=${text}`)
      await page.locator('.hc-points').waitFor()
      await page.evaluate(() => document.fonts.ready)
      const overflow = await page.locator('.home-circle').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
      assert.ok(overflow.scroll <= overflow.width + 1, `${platform} ${width} ${text} overflow ${JSON.stringify(overflow)}`)
      const clipped = await page.locator('.home-circle button').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.textContent))
      assert.deepEqual(clipped, [], `${platform} ${width} ${text} clipped buttons`)
      await page.getByRole('button', { name: 'Exchange 100 points for ₱100 reward', exact:true }).click()
      await page.getByRole('button', { name: 'Confirm · 100 points', exact:true }).click()
      await page.getByRole('status').waitFor()
      assert.equal(await page.locator('.hc-points').textContent(), '550')
      await page.locator('.home-circle').evaluate(el => el.scrollTop = 0)
      if (platform === 'ios' && ((width === 390 && text === 'comfortable') || (width === 320 && text === 'extra-large'))) {
        await page.screenshot({ path: `/tmp/home-circle-${width}-${text}.png` })
      }
      checked++
      await page.close()
    }
  }
  await browser.close()
}
console.log(`PASS: ${checked} browser, viewport and text-size combinations; no horizontal overflow; confirmed reward exchanges update points.`)

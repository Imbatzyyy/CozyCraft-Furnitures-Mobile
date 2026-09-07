import assert from 'node:assert/strict'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
let checked = 0
for (const [engine, platform] of [[chromium, 'android'], [webkit, 'ios']]) {
  const browser = await engine.launch({ headless: true, ...(platform === 'android' ? { channel: 'chrome' } : {}) })
  for (const [width,height] of [[320,640],[390,844],[768,1024],[844,390]]) {
    for (const text of ['standard','comfortable','large','extra-large']) {
      const page = await browser.newPage({ viewport: { width,height } })
      await page.goto(`http://127.0.0.1:5187/?account&platform=${platform}&text=${text}`)
      const card = page.locator('.profile-circle-card')
      await card.waitFor()
      await page.evaluate(() => document.fonts.ready)
      const result = await card.evaluate(el => ({ width:el.clientWidth, scroll:el.scrollWidth, bad:[...el.querySelectorAll('span,strong')].filter(c => c.scrollWidth > c.clientWidth + 2 && getComputedStyle(c).display !== 'inline').map(c => c.className), font:parseFloat(getComputedStyle(el.querySelector('.pc-note')).fontSize) }))
      assert.ok(result.scroll <= result.width + 1, JSON.stringify({platform,width,text,result}))
      assert.deepEqual(result.bad, [])
      assert.ok(result.font >= 13)
      assert.ok(await card.evaluate(el => el.clientHeight > 200 && getComputedStyle(el).display === 'block'), 'Legacy account styles must not collapse the card')
      if (platform === 'ios' && width === 390 && text === 'comfortable') await card.screenshot({path:'/tmp/profile-home-circle.png'})
      if (platform === 'ios' && width === 320 && text === 'extra-large') await card.screenshot({path:'/tmp/profile-home-circle-xl.png'})
      checked++
      await page.close()
    }
  }
  await browser.close()
}
console.log(`PASS: ${checked} profile-card viewport/text-size/browser combinations, readable copy and no clipped content.`)

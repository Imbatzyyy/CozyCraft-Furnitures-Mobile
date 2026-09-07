import assert from 'node:assert/strict'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
let checks=0
for(const [engine,platform] of [[chromium,'android'],[webkit,'ios']]) {
  const browser=await engine.launch({headless:true,...(platform==='android'?{channel:'chrome'}:{})})
  for(const width of [320,390,768,844]) for(const text of ['standard','comfortable','large','extra-large']) {
    const page=await browser.newPage({viewport:{width,height:844}})
    await page.goto(`http://127.0.0.1:5187/?discoveries&platform=${platform}&text=${text}`)
    const section=page.locator('.catalog-discoveries')
    await section.waitFor()
    assert.ok(await section.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
    assert.equal(await page.locator('.catalog-discoveries button').count(),4)
    await page.getByRole('button',{name:'Search for LYCKSELE LÖVÅS'}).click()
    assert.equal(await page.locator('output').textContent(),'LYCKSELE LÖVÅS')
    assert.ok(await page.locator('.discovery-name').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)))
    if(platform==='ios'&&width===390&&text==='comfortable') await section.screenshot({path:'/tmp/search-discoveries.png'})
    await page.close(); checks++
  }
  await browser.close()
}
console.log(`PASS ${checks} discovery shortcut layouts and taps`)

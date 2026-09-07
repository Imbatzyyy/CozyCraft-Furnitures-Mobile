import assert from "node:assert/strict"
const {chromium,webkit} = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
for (const engine of [chromium,webkit]) {
  const browser = await engine.launch(engine === chromium ? {channel:"chrome"} : {})
  for (const width of [320,390,768]) for (const size of ["standard","comfortable","large","extra-large"]) {
    const page = await browser.newPage({viewport:{width,height:844}})
    await page.goto(`http://127.0.0.1:5187/?range&text=${size}`)
    await page.getByRole("button",{name:/filter/i}).click()
    const min = page.getByRole("slider",{name:"Minimum price"}), max = page.getByRole("slider",{name:"Maximum price"})
    await min.scrollIntoViewIfNeeded()
    const rect = await min.boundingBox()
    assert(rect && rect.x >= 0 && rect.x + rect.width <= width)
    const y = rect.y + rect.height/2
    await page.mouse.move(rect.x+12,y); await page.mouse.down(); await page.mouse.move(rect.x+rect.width*.25,y,{steps:12}); await page.mouse.up()
    assert(Number(await min.inputValue()) > 0,"Minimum handle must drag")
    await page.mouse.move(rect.x+rect.width-12,y); await page.mouse.down(); await page.mouse.move(rect.x+rect.width*.75,y,{steps:12}); await page.mouse.up()
    assert(Number(await max.inputValue()) < 500000,"Maximum handle must drag")
    const before=Number(await min.inputValue());await min.focus();await page.keyboard.press("ArrowRight");assert(Number(await min.inputValue())>before)
    await page.getByRole("button",{name:"Reset",exact:true}).click()
    assert.equal(await min.inputValue(),"0");assert.equal(await max.inputValue(),"500000")
    const photos=await page.locator(".review-card-photos button").evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}}))
    assert.equal(photos[0].y,photos[1].y);assert(Math.abs(photos[1].x-photos[0].x-photos[0].width-10)<1)
    if(engine===webkit&&width===390&&size==="extra-large") {
      await page.locator(".catalog-filters").screenshot({path:"/tmp/cozy-dual-range.png"})
      await page.locator(".review-card-photos").screenshot({path:"/tmp/cozy-review-photos.png"})
    }
    await page.close()
  }
  await browser.close()
}
console.log("PASS 24 responsive cases: both handles drag, keyboard control, reset, adjacent review photos.")

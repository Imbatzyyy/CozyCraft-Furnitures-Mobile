import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5174";
if (process.env.QA_OUTPUT) await mkdir(process.env.QA_OUTPUT, {recursive:true});
let checks = 0;
for (const [engine, type] of Object.entries({chromium, webkit})) {
  const browser = await type.launch({headless:true});
  try {
    for (const [width,height] of [[320,568],[393,852],[844,390]]) {
      const page = await browser.newPage({viewport:{width,height},reducedMotion:width===320?"reduce":"no-preference"});
      const errors=[];const external=[];
      page.on("pageerror",error=>errors.push(error.message));
      await page.route("**/*",route=>{
        const url=route.request().url();
        if(!url.startsWith(origin)&&!url.startsWith("data:")){external.push(url);return route.abort();}
        return route.continue();
      });
      await page.goto(`${origin}/?checkout&payment-limits&text=extra-large&platform=${engine==='webkit'?'ios':'android'}`);
      await page.getByRole("button",{name:"Continue →",exact:true}).click();
      const cod=page.getByRole("button",{name:"Cash on delivery",exact:true});
      assert(await cod.isDisabled());
      await page.getByRole("button",{name:/WELCOME REWARD/}).click();
      assert(await cod.isEnabled());
      await cod.click();
      assert.equal(await cod.getAttribute("aria-pressed"),"true");
      await page.getByRole("button",{name:/No reward/}).click();
      assert(await cod.isDisabled());
      assert.equal(await page.getByRole("button",{name:"GCash",exact:true}).getAttribute("aria-pressed"),"false");
      assert(await page.getByRole("button",{name:"Continue →",exact:true}).isDisabled());
      await page.getByRole("button",{name:"GCash",exact:true}).click();
      await page.getByRole("button",{name:"Continue →",exact:true}).click();
      await page.getByText("REVIEW YOUR ORDER").waitFor();
      await page.getByRole("button",{name:"Back",exact:true}).click();
      await cod.scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.checkout-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`${engine} ${width}: overflow`);
      assert((await cod.boundingBox()).height>=44);
      if(width===393&&process.env.QA_OUTPUT) await page.screenshot({path:`${process.env.QA_OUTPUT}/payment-limits-${engine}.png`});
      await page.goto(`${origin}/?checkout&payment-limits&price=100001`);
      await page.getByRole("button",{name:"Continue →",exact:true}).click();
      assert(await page.getByRole("button",{name:"GCash",exact:true}).isDisabled());
      assert(await page.getByRole("button",{name:"Credit or debit card",exact:true}).isEnabled());
      assert.deepEqual(errors,[]);
      assert.deepEqual(external,[],"Isolated fixture made a production request");
      await page.close(); checks++;
    }
  } finally { await browser.close(); }
}
console.log(`PASS: ${checks} Chromium/WebKit checkout journeys; small phones, large text, landscape, vouchers, no automatic payment switch and provider caps. No live orders or payments.`);

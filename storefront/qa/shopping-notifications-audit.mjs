// Compiled storefront, mocked network only: no real pushes, vouchers or users.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.APP_URL || 'http://127.0.0.1:5197'
const output = process.env.QA_OUTPUT || '/tmp/cozy-shopping-ui'
await mkdir(output,{ recursive:true })
const id='11111111-1111-4111-8111-111111111111', rewardId='22222222-2222-4222-8222-222222222222'
const user={id,email:'qa@example.test',role:'authenticated',aud:'authenticated',created_at:'2026-01-01',app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Alex Rivera',cozy_tour_completed_v1:true},factors:[]}
const profile={id,role:'customer',full_name:'Alex Rivera',email:user.email,username:'alex.rivera',avatar_url:''}
const notifications = [
  {id:41,user_id:id,kind:'cart_reminder',title:'Your next cozy corner?',message:'Review the pieces in your bag.',entity_type:'shopping_reminder',entity_id:'bag',created_at:new Date().toISOString()},
  {id:42,user_id:id,kind:'wishlist_reminder',title:'Your saved favorites',message:'Revisit your wishlist.',entity_type:'shopping_reminder',entity_id:'saved',created_at:new Date().toISOString()},
  {id:43,user_id:id,kind:'shopping_offer',title:'A little comfort for you',message:'Your Cozy Surprise is ready.',entity_type:'mobile_reward',entity_id:rewardId,created_at:new Date().toISOString()},
]
let checked=0
for (const engine of [chromium,webkit]) {
  const browser=await engine.launch(engine===chromium ? {channel:'chrome',headless:true}:{headless:true})
  try {
    for (const [width,height] of [[320,640],[390,844],[844,390],[1440,1000]]) {
      const context=await browser.newContext({viewport:{width,height},reducedMotion:width===320?'reduce':'no-preference'})
      let prefs={offers:false,cart:false,wishlist:false,timezone:'Asia/Manila'}, saves=0, expired=false
      const reward=()=>({id:rewardId,user_id:id,points_cost:0,discount_amount:100,reward_source:'surprise',minimum_order_amount:10000,status:'available',code:'COZY-12345678901234567890123456789012',created_at:new Date().toISOString(),expires_at:expired?'2020-01-01':new Date(Date.now()+86400000).toISOString()})
      await context.routeWebSocket(/supabase\.(co|in)/,ws=>ws.close())
      await context.route(/https:\/\/[^/]*supabase\.(co|in)\//,async route=>{
        const req=route.request(),url=new URL(req.url()),path=url.pathname
        if(req.method()==='OPTIONS') return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}})
        const single=req.headers().accept?.includes('object')
        let data=[]
        if(path==='/auth/v1/user') data=user
        else if(path==='/rest/v1/profiles') data=single?profile:[profile]
        else if(path==='/rest/v1/products') data=[{id:'qa-sofa',name:'CozyCraft sofa',category:'Living room',price:12000,stock_quantity:10,status:'active',images:[`${base}/furniture/photo-1599696848652-f0ff23bc911f.jpg`],rating:5,review_count:1}]
        else if(path==='/rest/v1/store_settings') {const settings={id:true,account_settings:{},checkout_settings:{},fulfillment_settings:{}};data=single?settings:[settings]}
        else if(path.endsWith('/get_mobile_customer_onboarding')) data={userId:id,isGoogle:false,needsUsername:false,showVoucher:false,voucher:null}
        else if(path.endsWith('/touch_customer_device_session')) data=true
        else if(path==='/rest/v1/mobile_shopping_preferences') data=single?prefs:[prefs]
        else if(path==='/rest/v1/customer_preferences') data=single?{delivery_updates:true,home_circle_notes:false}:[{delivery_updates:true,home_circle_notes:false}]
        else if(path.endsWith('/set_mobile_shopping_preferences')) {const body=req.postDataJSON();saves++;prefs={offers:body.p_offers,cart:body.p_cart,wishlist:body.p_wishlist,timezone:body.p_timezone};data=prefs}
        else if(path==='/rest/v1/customer_notifications') {const match=url.searchParams.get('id')?.replace('eq.','');data=match?notifications.find(n=>String(n.id)===match)||null:notifications;if(!single&&match)data=data?[data]:[]}
        else if(path==='/rest/v1/mobile_loyalty_redemptions') data=single?reward():[reward()]
        else if(path==='/rest/v1/cart_items') data=[{product_id:'qa-sofa',quantity:1,selected_for_checkout:true}]
        else if(path==='/rest/v1/wishlist_items') data=[{product_id:'qa-sofa'}]
        else if(path.startsWith('/functions/')) data={}
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
      })
      await context.addInitScript(({user})=>{
        const now=Math.floor(Date.now()/1000)
        const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:now+3600,iat:now,role:'authenticated',aal:'aal1',amr:[{method:'password',timestamp:now}],session_id:'33333333-3333-4333-8333-333333333333'}].map(v=>btoa(JSON.stringify(v)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')).join('.')+'.fixture'
        localStorage.setItem('sb-gwjsivqksyimuabbdyqq-auth-token',JSON.stringify({user,access_token:token,refresh_token:'qa-only',expires_at:now+3600,expires_in:3600,token_type:'bearer'}))
        localStorage.setItem('cozycraft-mobile-text-size-v1','extra-large')
      },{user})
      const page=await context.newPage(),errors=[]
      page.on('pageerror',error=>errors.push(error.message))
      if(engine===chromium&&width===320) {const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})}
      await page.goto(`${base}/#/shop`)
      await page.getByRole('button',{name:'Open profile',exact:true}).click()
      const offers=page.getByRole('switch',{name:'Offers and surprises'})
      await offers.waitFor()
      await offers.click()
      await page.waitForFunction(()=>document.querySelector('[aria-label="Offers and surprises"]')?.getAttribute('aria-checked')==='true')
      assert.equal(saves,1)
      for (const name of ['Cart reminders','Wishlist reminders']) {await page.getByRole('switch',{name}).click();await page.waitForFunction(name=>document.querySelector(`[aria-label="${name}"]`)?.getAttribute('aria-checked')==='true',name)}
      await page.locator('.shopping-preferences').scrollIntoViewIfNeeded()
      assert.equal(await page.locator('.shopping-preferences').evaluate(e=>e.scrollWidth>e.clientWidth+1),false)
      if(width===390) await page.screenshot({path:`${output}/${engine.name()}-preferences.png`,animations:'disabled'})
      await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{type:'cozycraft-native-back'}})))
      await page.getByRole('button',{name:'Open notifications',exact:true}).click()
      await page.getByRole('button',{name:/Your next cozy corner.*Open/}).click()
      await page.locator('.bag-page').waitFor()
      await page.getByRole('button',{name:'Open notifications',exact:true}).click()
      await page.getByRole('button',{name:/Your saved favorites.*Open/}).click()
      await page.getByRole('heading',{name:'Saved pieces',exact:true}).waitFor()
      // Real native bridge event; repeat the delivery before it is acknowledged.
      await page.evaluate(()=>{for(let i=0;i<5;i++) window.dispatchEvent(new MessageEvent('message',{source:window,data:{type:'cozycraft-open-notifications',notificationId:'43'}}))})
      await page.getByRole('dialog',{name:'A little comfort, for you.'}).waitFor()
      assert.equal(await page.locator('.shopping-offer').count(),1)
      assert.equal(await page.locator('.shopping-offer-content').evaluate(e=>e.scrollWidth>e.clientWidth+1),false)
      const close=page.getByRole('button',{name:'Close offer'})
      const box=await close.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height)
      await page.getByRole('button',{name:/Shop this offer/}).scrollIntoViewIfNeeded()
      if(width===390) await page.screenshot({path:`${output}/${engine.name()}-offer.png`,animations:'disabled'})
      await close.click()
      assert.equal(await page.evaluate(()=>document.getElementById('root').inert),false)
      expired=true
      await page.getByRole('button',{name:'Open notifications',exact:true}).click()
      await page.getByRole('button',{name:/A little comfort for you.*Open/}).click()
      await page.getByText(/This offer has expired/).waitFor()
      assert.equal(await page.getByRole('button',{name:/Shop this offer/}).count(),0)
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.shopping-offer').count(),0)
      assert.deepEqual(errors,[])
      console.log(`PASS ${engine.name()} ${width}x${height}, extra-large text`);checked++
      await context.close()
    }
  } finally {await browser.close()}
}
console.log(`${checked} full-app shopping notification layouts/flows passed`)

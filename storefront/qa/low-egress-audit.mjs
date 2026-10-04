// Exercise the compiled app and real Supabase client with isolated backend fixtures.
// No production accounts, orders, emails, payments or push messages are created.
import assert from 'node:assert/strict';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.APP_URL || 'http://127.0.0.1:5197';
const id='11111111-1111-4111-8111-111111111111';
// Optional read-only production CDN check. All account/commerce data stays mocked.
const publicPhoto=process.env.QA_PUBLIC_IMAGE_URL || '';
for(const engine of [chromium,webkit]) for(const failInitialOrders of [false,true]) {
  const browser=await engine.launch(engine===chromium?{channel:'chrome'}:{});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const user={id,email:'qa@example.test',role:'authenticated',aud:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'QA Customer',cozy_tour_completed_v1:true},factors:[]};
  const products=[{id:'qa-a',name:'QA Recovery Sofa',category:'Living room',price:12000,stock_quantity:10,status:'active',images:publicPhoto?[publicPhoto]:[],updated_at:'2026-10-01T00:00:00Z',rating:5,review_count:7}];
  const orders=Array.from({length:12},(_,i)=>({id:`22222222-2222-4222-8222-${String(i+1).padStart(12,'0')}`,order_number:`CC-QA-${12-i}`,user_id:id,status:'delivered',created_at:new Date(Date.UTC(2026,8,28-i)).toISOString(),payment_method:'cod',payment_status:'paid',total:12000,subtotal:12000,order_items:[{id:i+1,product_id:'qa-a',product_name:'QA Recovery Sofa',quantity:1,unit_price:12000}],order_status_history:[]}));
  const reviews=Array.from({length:7},(_,i)=>({id:`review-${i}`,rating:i===6?4:5,body:`Verified review ${i+1}`,image_urls:[],approved:true,created_at:'2026-09-01T00:00:00Z',reviewer_display_name:`QA Reviewer ${i+1}`}));
  const reads=[];let changed=false;let orderReads=0;
  await context.routeWebSocket(/supabase\.(co|in)/,ws=>ws.close());
  await context.route(/https:\/\/[^/]*supabase\.(co|in)\//,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    if(publicPhoto&&url.href===publicPhoto)return route.continue();
    if(req.method()==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    reads.push({path,select:url.searchParams.get('select')});
    let data=[];
    if(path==='/auth/v1/user')data=user;
    else if(path==='/rest/v1/products')data=url.searchParams.get('select')==='id,updated_at'?products.map(({id,updated_at})=>({id,updated_at})):products;
    else if(path==='/rest/v1/profiles') {const profile={id,role:'customer',full_name:'QA Customer',username:'qa.customer',email:user.email,avatar_url:''};data=req.headers().accept?.includes('object')?profile:[profile];}
    else if(path==='/rest/v1/store_settings')data={id:true,account_settings:{},checkout_settings:{},fulfillment_settings:{}};
    else if(path.endsWith('/get_mobile_customer_onboarding'))data={userId:id,isGoogle:false,needsUsername:false,showVoucher:false,voucher:null};
    else if(path.endsWith('/touch_customer_device_session'))data=true;
    else if(path.endsWith('/get_mobile_loyalty')||path.endsWith('/mobile_loyalty_accounts'))data={tier:'member',points_balance:0,lifetime_eligible_spend:144000};
    else if(path.endsWith('/customer_order_page')){orderReads++;if(failInitialOrders&&orderReads===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary fixture outage'})});const page=req.postDataJSON().p_page||1;data={orders:orders.slice((page-1)*5,page*5),total:12,counts:{all:12,delivered:12}};}
    else if(path.endsWith('/mobile_product_review_page')){const {p_page=1,p_rating=null}=req.postDataJSON();const filtered=reviews.filter(row=>!p_rating||row.rating===p_rating);data={reviews:filtered.slice((p_page-1)*5,p_page*5),total:7,matched:filtered.length,average:34/7,counts:{5:6,4:1}};}
    else if(path==='/rest/v1/wishlist_items')data=changed?[{product_id:'qa-a'}]:[];
    else if(path==='/rest/v1/cart_items')data=changed?[{product_id:'qa-a',quantity:2,selected:true}]:[];
    else if(path==='/rest/v1/customer_notifications')data=changed?[{id:'notice',title:'Delivery updated',message:'QA update',kind:'order',created_at:new Date().toISOString(),read_at:null}]:[];
    else if(path.startsWith('/functions/'))data={};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.addInitScript(user=>{
    const now=Math.floor(Date.now()/1000),jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:now+3600,iat:now,role:'authenticated',aal:'aal1',amr:[{method:'password',timestamp:now}],session_id:'33333333-3333-4333-8333-333333333333'}].map(value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')).join('.')+'.qa';
    localStorage.setItem('sb-gwjsivqksyimuabbdyqq-auth-token',JSON.stringify({user,access_token:jwt,refresh_token:'qa-only',expires_at:now+3600,expires_in:3600,token_type:'bearer'}));
  },user);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(`${base}/#/shop`);
    await page.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('cozycraft-profile'))?.username==='qa.customer'}catch{return false}});
    await page.waitForTimeout(700);
    if(publicPhoto){
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('.lux-card img')).some(image=>image.complete&&image.naturalWidth>0&&image.currentSrc.startsWith('https://www.cozycraftfurnitures.com/.netlify/images?')&&!image.hasAttribute('crossorigin')));
      console.log(`PASS ${engine.name()}: live CDN thumbnail displays without downloading the original fallback`);
    }
    assert.equal(reads.filter(row=>row.path==='/rest/v1/products'&&row.select!=='id,updated_at').length,1,'startup must share one full catalog read');
    assert.equal(reads.filter(row=>row.path==='/rest/v1/profiles' && row.select?.includes('full_name')).length,1,JSON.stringify(reads.filter(row=>row.path==='/rest/v1/profiles')));
    changed=true;orders[0].status='shipped';
    await page.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(1100);
    if(failInitialOrders)assert.ok(orderReads>=3,'failed startup hydration must retry on reconnect, not just refresh individual resources');
    assert.equal(reads.filter(row=>row.path==='/rest/v1/products'&&row.select==='id,updated_at').length,1,'resume must use one manifest');
    assert.equal(reads.filter(row=>row.path==='/rest/v1/products'&&row.select!=='id,updated_at').length,1,'unchanged catalog must not download again');
    await page.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('cozycraft-bag'))?.[0]?.quantity===2&&JSON.parse(localStorage.getItem('cozycraft-saved'))?.includes('qa-a')}catch{return false}});
    await page.locator('.lux-nav button[data-nav="account"]').click();
    await page.getByRole('button',{name:/My orders/i}).click();
    await page.locator('.order-summary-card').first().waitFor();
    assert.equal(await page.locator('.order-summary-card').count(),5);
    await page.getByRole('navigation',{name:'History pages'}).first().getByRole('button',{name:'Next →'}).click();
    await page.getByText('#CC-QA-7',{exact:true}).waitFor();
    assert.equal(await page.locator('.order-summary-card').count(),5);
    assert.equal(await page.getByText('Page 2 of 3',{exact:true}).count(),2);
    await page.locator('.order-summary-card').last().getByRole('button',{name:/View complete order/}).click();
    await page.getByRole('dialog',{name:/Order CC-QA-3 details/}).waitFor();
    await page.getByRole('button',{name:'Return to all orders'}).click();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cozycraft-close-account-layer',{cancelable:true})));
    await page.locator('.lux-nav button[data-nav="shop"]').click();
    await page.getByRole('button',{name:'View QA Recovery Sofa',exact:true}).first().click();
    await page.getByText('7 published reviews',{exact:true}).waitFor();
    assert.equal(await page.locator('.review-list article').count(),5);
    await page.getByRole('navigation',{name:'History pages'}).getByRole('button',{name:'Next →'}).click();
    await page.getByText('Verified review 7',{exact:true}).waitFor();
    assert.equal(await page.locator('.review-list article').count(),2);
    await page.getByRole('button',{name:'4 star 1',exact:true}).click();
    await page.getByText('Verified review 7',{exact:true}).waitFor();
    assert.equal(await page.locator('.review-list article').count(),1);
    assert.equal(await page.getByText('7 published reviews',{exact:true}).count(),1);
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    console.log(`PASS ${engine.name()}${failInitialOrders?' + initial order outage':''}: one startup catalog/profile read, bounded resume, bag/wishlist recovery, 12-order pagination, older-order detail, review pagination/filter/global totals`);
  } finally {await browser.close();}
}

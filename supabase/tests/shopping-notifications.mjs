// Disposable in-memory PostgreSQL (PGlite), never a linked Supabase database.
// PGLITE_MODULE must point to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const uid = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema private; create schema auth; create schema cron; create schema vault; create schema net;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
  create function public.security_action_allowed() returns boolean language sql as $$ select auth.uid() is not null $$;
  create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
  create view vault.decrypted_secrets as select ''::text as name,''::text as decrypted_secret where false;
  create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
  create table profiles(id uuid primary key,role text default 'customer',created_at timestamptz default now()-interval '30 days');
  create table customer_preferences(user_id uuid primary key references profiles(id) on delete cascade,home_circle_notes boolean default false);
  create table products(id text primary key,status text default 'active',stock_quantity int default 5);
  create table cart_items(user_id uuid references profiles(id) on delete cascade,product_id text references products(id),quantity int default 1,primary key(user_id,product_id));
  create table wishlist_items(user_id uuid references profiles(id) on delete cascade,product_id text references products(id),created_at timestamptz default now(),primary key(user_id,product_id));
  create table orders(id uuid primary key default gen_random_uuid(),user_id uuid,status text default 'pending',payment_status text default 'pending',created_at timestamptz default now(),updated_at timestamptz default now(),subtotal numeric default 5000,total numeric default 5000,reward_discount numeric default 0,home_circle_redemption_id uuid);
  create table payment_transactions(id bigint generated always as identity,order_id uuid references orders(id));
  create table order_items(order_id uuid references orders(id),product_id text);
  create table mobile_push_tokens(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id) on delete cascade,token text unique default gen_random_uuid()::text,platform text default 'android',active boolean default true);
  create function public.register_mobile_push_token(p_token text,p_platform text) returns void language plpgsql as $$
  begin
    if auth.uid() is null or length(trim(coalesce(p_token,'')))<20 then raise exception 'Invalid registration'; end if;
    insert into mobile_push_tokens(user_id,token,platform) values(auth.uid(),trim(p_token),p_platform)
    on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,active=true;
  end; $$;
  create table mobile_loyalty_redemptions(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id) on delete cascade,points_cost int,discount_amount numeric,reward_source text,minimum_order_amount numeric default 0,status text default 'available',code text unique,expires_at timestamptz default now()+interval '30 days',created_at timestamptz default now(),used_at timestamptz,
    constraint mobile_loyalty_redemptions_reward_source_check check(reward_source in ('points','welcome')));
  create table customer_notifications(id bigint generated always as identity primary key,user_id uuid references profiles(id) on delete cascade,kind text,title text,message text,entity_type text,entity_id text,read_at timestamptz,created_at timestamptz default now());
`)
const migration = await readFile(new URL('../migrations/20260924090000_mobile_shopping_notifications.sql', import.meta.url), 'utf8')
await db.exec(migration)
const starterRules = (await db.query('select * from private.mobile_shopping_rules')).rows[0]
// Exercise the real atomic redemption helper, not a reimplementation of it.
const onboarding = await readFile(new URL('../migrations/20260904190000_mobile_google_customer_onboarding.sql', import.meta.url),'utf8')
await db.exec(onboarding.slice(onboarding.indexOf('create or replace function public.apply_mobile_reward_to_order'),onboarding.indexOf('revoke all on function public.get_mobile_google_onboarding()')))
const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0]
const zone = await scalar("select name from pg_timezone_names where extract(hour from now() at time zone name)=12 limit 1")
const nightZone = await scalar("select name from pg_timezone_names where extract(hour from now() at time zone name)=2 limit 1")
async function reset() {
  await db.exec(`truncate profiles,products,orders cascade;
    update private.mobile_shopping_rules set enabled=true,offers_enabled=false,discount_amount=100,minimum_order_amount=10000,monthly_budget=1000;
    insert into profiles(id) values('${uid}'),('${other}'); insert into products(id) values('sofa');
    insert into mobile_push_tokens(user_id,shopping_supported) values('${uid}',true),('${other}',true);
    insert into cart_items(user_id,product_id) values('${uid}','sofa');
    update private.mobile_shopping_activity set cart_changed_at=now()-interval '3 days',cart_due_at=now()-interval '1 hour';
    select set_config('test.uid','${uid}',false);`)
  await db.query('select set_mobile_shopping_preferences(false,true,true,$1)',[zone])
}
const run = () => scalar('select private.run_mobile_shopping_campaigns()')
const prepare = id => scalar('select prepare_mobile_shopping_push($1)',[id])
const latest = () => scalar('select max(id) from customer_notifications')
let passed=0
async function test(name, fn) { await reset(); await fn(); passed++; console.log(`PASS ${name}`) }
await test('conservative starter policy is configured without activating campaigns', async () => {
  assert.equal(starterRules.enabled,false)
  assert.equal(starterRules.offers_enabled,false)
  assert.equal(Number(starterRules.discount_amount),100)
  assert.equal(Number(starterRules.minimum_order_amount),10000)
  assert.equal(Number(starterRules.monthly_budget),1000)
  assert.equal(starterRules.offer_hours,48)
})
await test('old and unknown-platform devices cannot qualify for new shopping campaigns',async () => {
  await db.exec('update mobile_push_tokens set shopping_supported=false')
  assert.equal(await run(),0)
  await db.exec("update mobile_push_tokens set shopping_supported=true,platform='unknown'; update private.mobile_shopping_activity set next_check_at=now()")
  assert.equal(await run(),0)
  await db.exec("update mobile_push_tokens set platform='android'; update private.mobile_shopping_activity set next_check_at=now()")
  assert.equal(await run(),1)
})
await test('new native registration marks only the registered token as compatible',async () => {
  const token='native-registration-fixture-token'
  await db.query('select register_mobile_shopping_token($1,$2)',[token,'ios'])
  const row=(await db.query('select user_id,platform,shopping_supported from mobile_push_tokens where token=$1',[token])).rows[0]
  assert.deepEqual(row,{user_id:uid,platform:'ios',shopping_supported:true})
  await assert.rejects(db.query('select register_mobile_shopping_token($1,$2)',[token,'unknown']),/native platform/)
  await db.exec("select set_config('test.uid','',false)")
  await assert.rejects(db.query('select register_mobile_shopping_token($1,$2)',[token,'ios']),/sign in/)
  assert.equal(await scalar("select has_function_privilege('anon','public.register_mobile_shopping_token(text,text)','execute')"),false)
})
await test('no implicit consent and offers disabled', async () => {
  await db.exec('delete from mobile_shopping_preferences')
  assert.equal(await run(),0)
  assert.equal(await scalar('select offers_enabled from private.mobile_shopping_rules'),false)
})
await test('one cart reminder per unchanged cart, lease and shared cooldown',async () => {
  assert.equal(await run(),1); assert.equal(await run(),0)
  const id=await latest(), row=await prepare(id)
  assert.equal(row.kind,'cart_reminder'); assert.ok(row.lease_id)
  assert.equal(await prepare(id),null)
  await db.query('select finish_mobile_shopping_push($1,$2,true)',[id,row.lease_id])
  await db.exec(`update private.mobile_shopping_activity set next_check_at=now(),cart_changed_at=now()-interval '2 days'`)
  assert.equal(await run(),0)
})
await test('cart removal cancels queued reminders',async () => {
  await run(); const id=await latest(); await db.exec('delete from cart_items')
  assert.equal(await prepare(id),null)
  assert.equal(await scalar('select status from private.mobile_shopping_deliveries'), 'cancelled')
})
await test('stock change and pending payment suppress reminders',async () => {
  await db.exec('update products set stock_quantity=0'); assert.equal(await run(),0)
  await db.exec(`update products set stock_quantity=5; update private.mobile_shopping_activity set next_check_at=now(); insert into orders(user_id) values('${uid}')`)
  assert.equal(await run(),0)
})
await test('withdrawal is rechecked immediately before dispatch',async () => {
  await run(); const id=await latest(); await db.query('select set_mobile_shopping_preferences(false,false,false,$1)',[zone])
  assert.equal(await prepare(id),null)
})
await test('quiet hours defer and do not spend an attempt',async () => {
  await run(); const id=await latest(); await db.query('update mobile_shopping_preferences set timezone=$1',[nightZone])
  assert.equal(await prepare(id),null)
  assert.equal(await scalar('select attempts from private.mobile_shopping_deliveries'),0)
})
await test('bounded retries, stale leases rejected, expired queue cancelled',async () => {
  await run(); const id=await latest(), first=await prepare(id)
  await db.query('select finish_mobile_shopping_push($1,$2,false)',[id,first.lease_id])
  await db.exec("update private.mobile_shopping_deliveries set next_attempt_at=now()")
  const second=await prepare(id)
  await db.query('select finish_mobile_shopping_push($1,$2,true)',[id,first.lease_id])
  assert.equal(await scalar('select status from private.mobile_shopping_deliveries'),'sending')
  assert.notEqual(second.lease_id, first.lease_id)
  await db.exec("update private.mobile_shopping_deliveries set next_attempt_at=now(),expires_at=now()-interval '1 second'")
  assert.equal(await prepare(id),null)
})
await test('wishlist reminder waits, then stops after a matching purchase',async () => {
  await db.exec(`delete from cart_items; insert into wishlist_items(user_id,product_id) values('${uid}','sofa');`)
  assert.equal(await run(),0)
  await db.exec("update private.mobile_shopping_activity set next_check_at=now(),wishlist_due_at=now()-interval '1 day'")
  assert.equal(await run(),1); const id=await latest()
  assert.equal(await scalar('select kind from customer_notifications'),'wishlist_reminder')
  await db.exec(`insert into orders(user_id,status,payment_status) values('${uid}','processing','paid'); insert into order_items(order_id,product_id) select id,'sofa' from orders;`)
  assert.equal(await prepare(id),null)
})
await test('offers reserve exact budget, are account-bound, and enforce the merchandise minimum',async () => {
  await db.exec("update private.mobile_shopping_rules set offers_enabled=true,monthly_budget=100")
  await db.query('select set_mobile_shopping_preferences(true,true,true,$1)',[zone])
  assert.equal(await run(),1)
  assert.equal(await scalar('select kind from customer_notifications'),'shopping_offer')
  const reward=await scalar('select id from mobile_loyalty_redemptions')
  assert.equal(Number(await scalar('select sum(discount_amount) from mobile_loyalty_redemptions')), 100)
  assert.equal(Number(await scalar('select minimum_order_amount from mobile_loyalty_redemptions')),10000)
  assert.ok(await scalar("select expires_at > now()+interval '47 hours' and expires_at <= now()+interval '48 hours' from mobile_loyalty_redemptions"))
  await db.exec(`insert into cart_items(user_id,product_id) values('${other}','sofa'); select set_config('test.uid','${other}',false);`)
  await db.query('select set_mobile_shopping_preferences(true,false,false,$1)',[zone])
  await db.exec(`update private.mobile_shopping_activity set cart_due_at=now()-interval '1 hour',next_check_at=now() where user_id='${other}'`)
  assert.equal(await scalar(`select private.mobile_shopping_eligible('${other}','shopping_offer')`),true)
  assert.equal(await run(),0)
  await db.exec(`insert into orders(user_id,subtotal,total) values('${other}',10000,10500)`)
  const order=await scalar('select id from orders')
  await assert.rejects(db.query('select apply_mobile_reward_to_order($1,$2)',[order,reward]),/unavailable/)
  await db.exec(`select set_config('test.uid','${uid}',false); update orders set user_id='${uid}',subtotal=9999;`)
  await assert.rejects(db.query('select apply_mobile_reward_to_order($1,$2)',[order,reward]),/subtotal/)
  await db.exec('update orders set subtotal=10000')
  await db.query('select apply_mobile_reward_to_order($1,$2)',[order,reward])
  assert.equal(Number(await scalar('select total from orders')),10400)
  await db.query('select apply_mobile_reward_to_order($1,$2)',[order,reward])
  assert.equal(Number(await scalar('select total from orders')),10400)
  assert.equal(Number(await scalar('select reward_discount from orders')),100)
})
await test('the starter budget issues exactly ten vouchers and never an eleventh',async () => {
  await db.exec(`update private.mobile_shopping_rules set offers_enabled=true;
    delete from cart_items;
    insert into profiles(id) select ('33333333-3333-4333-8333-'||lpad(n::text,12,'0'))::uuid from generate_series(1,11) n;
    insert into mobile_push_tokens(user_id,shopping_supported) select id,true from profiles where id::text like '33333333-%';
    insert into cart_items(user_id,product_id) select id,'sofa' from profiles where id::text like '33333333-%';`)
  await db.query("insert into mobile_shopping_preferences(user_id,offers,timezone) select id,true,$1 from profiles where id::text like '33333333-%'",[zone])
  await db.exec("update private.mobile_shopping_activity set cart_due_at=now()-interval '1 hour',next_check_at=now()")
  assert.equal(await run(),10)
  assert.equal(Number(await scalar("select count(*) from mobile_loyalty_redemptions where reward_source='surprise'")),10)
  assert.equal(Number(await scalar('select sum(discount_amount) from mobile_loyalty_redemptions')),1000)
  await db.exec('update private.mobile_shopping_activity set next_check_at=now()')
  assert.equal(await run(),0)
})
await test('unused, cancelled and redeemed vouchers still consume the rolling budget',async () => {
  await db.exec(`update private.mobile_shopping_rules set offers_enabled=true;
    insert into mobile_loyalty_redemptions(user_id,points_cost,discount_amount,reward_source,minimum_order_amount,code,status,created_at,expires_at)
    select '${other}',0,100,'surprise',10000,'OLD-'||n,
      case when n<=3 then 'cancelled' when n<=6 then 'applied' else 'available' end,
      now()-interval '29 days',now()-interval '27 days' from generate_series(1,10) n;`)
  await db.query('select set_mobile_shopping_preferences(true,false,false,$1)',[zone])
  assert.equal(await run(),0)
  // Only genuinely aged-out reservations free budget; status changes do not.
  await db.exec("update mobile_loyalty_redemptions set created_at=now()-interval '32 days'; update private.mobile_shopping_activity set next_check_at=now()")
  assert.equal(await run(),1)
})
await test('budget window protects Manila month boundaries and 31-day months',async () => {
  for (const [at,start] of [
    ['2026-10-01T00:01:00+08:00','2026-09-01T00:01:00+08:00'],
    ['2026-07-31T23:59:00+08:00','2026-07-01T00:00:00+08:00'],
    ['2027-03-01T00:01:00+08:00','2027-01-30T00:01:00+08:00'],
  ]) assert.equal(await scalar('select private.mobile_shopping_budget_start($1::timestamptz)=$2::timestamptz',[at,start]),true)
})
await test('one surprise cannot be reused or stacked with a second Home Circle voucher',async () => {
  await db.exec("update private.mobile_shopping_rules set offers_enabled=true")
  await db.query('select set_mobile_shopping_preferences(true,false,false,$1)',[zone])
  await run()
  const reward=await scalar('select id from mobile_loyalty_redemptions')
  await db.exec(`insert into orders(user_id,subtotal,total) values('${uid}',10000,10000)`)
  const firstOrder=await scalar('select id from orders')
  await db.query('select apply_mobile_reward_to_order($1,$2)',[firstOrder,reward])
  const secondOrder=await scalar(`insert into orders(user_id,subtotal,total) values('${uid}',10000,10000) returning id`)
  await assert.rejects(db.query('select apply_mobile_reward_to_order($1,$2)',[secondOrder,reward]),/unavailable/)
  const secondReward=await scalar(`insert into mobile_loyalty_redemptions(user_id,points_cost,discount_amount,reward_source,code)
    values('${uid}',0,100,'welcome','WELCOME-TEST') returning id`)
  await assert.rejects(db.query('select apply_mobile_reward_to_order($1,$2)',[firstOrder,secondReward]),/already has/)
  assert.equal(Number(await scalar('select total from orders where id=$1',[firstOrder])),9900)
})
await test('an expired surprise does not bypass the per-account 30-day issuance limit',async () => {
  await db.exec(`update private.mobile_shopping_rules set offers_enabled=true;
    insert into mobile_loyalty_redemptions(user_id,points_cost,discount_amount,reward_source,minimum_order_amount,code,created_at,expires_at)
    values('${uid}',0,100,'surprise',10000,'RECENT-EXPIRED',now()-interval '10 days',now()-interval '8 days');`)
  await db.query('select set_mobile_shopping_preferences(true,false,false,$1)',[zone])
  assert.equal(await run(),0)
  await db.exec("update mobile_loyalty_redemptions set created_at=now()-interval '31 days'; update private.mobile_shopping_activity set next_check_at=now()")
  assert.equal(await run(),1)
})
await test('all marketing shares the rolling weekly cap, including announcements',async () => {
  await db.exec(`insert into customer_preferences(user_id,home_circle_notes) values('${uid}',true);
    insert into customer_notifications(user_id,kind,title,message) select '${uid}','promotion','Announcement','News' from generate_series(1,3);
    update private.mobile_shopping_deliveries set status='sent',sent_at=now()-interval '3 days' where notification_id<(select max(notification_id) from private.mobile_shopping_deliveries);`)
  assert.equal(await prepare(await latest()),null)
})
await test('invalid timezones and unsafe or incomplete offer rules are rejected',async () => {
  await assert.rejects(db.query('select set_mobile_shopping_preferences(true,true,true,$1)',['not/a-zone']),/time zone/)
  for (const setting of [
    'discount_amount=null','minimum_order_amount=null','monthly_budget=null',
    'discount_amount=300,minimum_order_amount=30000','minimum_order_amount=9999',
    'monthly_budget=1001','monthly_budget=99',
  ]) await assert.rejects(db.exec(`update private.mobile_shopping_rules set offers_enabled=true,${setting}`),/check constraint/)
})
await test('customers cannot dispatch pushes or alter campaign rules',async () => {
  assert.equal(await scalar("select has_function_privilege('authenticated','public.prepare_mobile_shopping_push(bigint)','execute')"),false)
  assert.equal(await scalar("select has_function_privilege('anon','public.set_mobile_shopping_preferences(boolean,boolean,boolean,text)','execute')"),false)
  assert.equal(await scalar("select has_table_privilege('authenticated','private.mobile_shopping_rules','update')"),false)
  assert.equal(await scalar("select has_table_privilege('authenticated','public.mobile_shopping_preferences','update')"),false)
})
await test('a second parallel candidate cannot acquire a competing account lease',async () => {
  await db.exec(`insert into customer_preferences(user_id,home_circle_notes) values('${uid}',true);
    insert into customer_notifications(user_id,kind,title,message) select '${uid}','promotion','Announcement','News' from generate_series(1,2);`)
  const ids=(await db.query('select id from customer_notifications order by id')).rows.map(row=>row.id)
  assert.ok((await prepare(ids[0])).lease_id)
  assert.equal(await prepare(ids[1]),null)
})
await test('failed deliveries stop after five attempts',async () => {
  await run();const id=await latest()
  for (let i=0;i<5;i++) {
    await db.exec('update private.mobile_shopping_deliveries set next_attempt_at=now()')
    const row=await prepare(id);assert.ok(row.lease_id)
    await db.query('select finish_mobile_shopping_push($1,$2,false)',[id,row.lease_id])
  }
  assert.equal(await scalar('select status from private.mobile_shopping_deliveries'),'failed')
  assert.equal(await prepare(id),null)
})
await test('a voucher that expired after notification cannot be redeemed',async () => {
  await db.exec(`insert into mobile_loyalty_redemptions(user_id,points_cost,discount_amount,reward_source,minimum_order_amount,code,expires_at)
    values('${uid}',0,100,'surprise',10000,'COZY-EXPIRED',now()-interval '1 minute'); insert into orders(user_id,subtotal,total) values('${uid}',10000,10000);`)
  const reward=await scalar('select id from mobile_loyalty_redemptions'),order=await scalar('select id from orders')
  await assert.rejects(db.query('select apply_mobile_reward_to_order($1,$2)',[order,reward]),/expired/)
})
await test('global pause cancels sends without altering any order or reward',async () => {
  await run();const id=await latest()
  await db.exec('update private.mobile_shopping_rules set enabled=false')
  assert.equal(await prepare(id),null);assert.equal(await run(),0)
})
console.log(`${passed} PostgreSQL shopping notification scenarios passed`)
await db.close()

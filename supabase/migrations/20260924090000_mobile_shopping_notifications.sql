-- App-only, explicit-consent shopping reminders. No discount is enabled by
-- this migration. Conservative starter figures are configured, but production
-- activation still requires the deployment and device-delivery checks.
create table public.mobile_shopping_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  offers boolean not null default false,
  cart boolean not null default false,
  wishlist boolean not null default false,
  timezone text not null default 'Asia/Manila',
  updated_at timestamptz not null default now()
);
alter table public.mobile_shopping_preferences enable row level security;
revoke all on public.mobile_shopping_preferences from public, anon, authenticated;
grant select on public.mobile_shopping_preferences to authenticated;
create policy mobile_shopping_preferences_own on public.mobile_shopping_preferences
  for select to authenticated using (user_id = (select auth.uid()));

create function public.set_mobile_shopping_preferences(p_offers boolean, p_cart boolean, p_wishlist boolean, p_timezone text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.mobile_shopping_preferences;
begin
  if auth.uid() is null or not coalesce(public.security_action_allowed(), false) then
    raise exception 'Please sign in and complete account verification';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a valid time zone';
  end if;
  insert into public.mobile_shopping_preferences(user_id, offers, cart, wishlist, timezone)
  values(auth.uid(), coalesce(p_offers,false), coalesce(p_cart,false), coalesce(p_wishlist,false), p_timezone)
  on conflict(user_id) do update set offers=excluded.offers, cart=excluded.cart,
    wishlist=excluded.wishlist, timezone=excluded.timezone, updated_at=now()
  returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.set_mobile_shopping_preferences(boolean,boolean,boolean,text) from public, anon;
grant execute on function public.set_mobile_shopping_preferences(boolean,boolean,boolean,text) to authenticated;

-- Only this client generation understands shopping destinations/channels. Keep
-- older device registrations valid for essential alerts, but not new campaigns.
alter table public.mobile_push_tokens add column shopping_supported boolean not null default false;
create function public.register_mobile_shopping_token(p_token text,p_platform text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or not coalesce(public.security_action_allowed(),false) then
    raise exception 'Please sign in and complete account verification';
  end if;
  if p_platform is null or p_platform not in ('ios','android') then raise exception 'A native platform is required'; end if;
  perform public.register_mobile_push_token(p_token,p_platform);
  update public.mobile_push_tokens set shopping_supported=true
    where user_id=auth.uid() and token=trim(p_token);
end; $$;
revoke all on function public.register_mobile_shopping_token(text,text) from public,anon;
grant execute on function public.register_mobile_shopping_token(text,text) to authenticated;

create table private.mobile_shopping_rules (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  offers_enabled boolean not null default false,
  discount_amount numeric(12,2) default 100,
  minimum_order_amount numeric(12,2) default 10000,
  monthly_budget numeric(12,2) default 1000,
  offer_hours integer not null default 48 check(offer_hours between 24 and 48),
  constraint mobile_shopping_starter_limits check (not offers_enabled or (
    discount_amount is not null and discount_amount = 100
    and minimum_order_amount is not null and minimum_order_amount >= discount_amount * 100
    and monthly_budget is not null and monthly_budget between discount_amount and 1000))
);
insert into private.mobile_shopping_rules(id) values(true);
revoke all on private.mobile_shopping_rules from public, anon, authenticated;

alter table public.mobile_loyalty_redemptions drop constraint mobile_loyalty_redemptions_reward_source_check;
alter table public.mobile_loyalty_redemptions add constraint mobile_loyalty_redemptions_reward_source_check check (
  (reward_source='points' and points_cost in (100,250,500)) or
  (reward_source in ('welcome','surprise') and points_cost=0)
);
create index mobile_surprise_budget_idx on public.mobile_loyalty_redemptions(created_at, user_id) where reward_source='surprise';

create table private.mobile_shopping_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cart_changed_at timestamptz not null default now(),
  wishlist_changed_at timestamptz not null default now(),
  cart_due_at timestamptz not null default now() + interval '36 hours',
  wishlist_due_at timestamptz not null default now() + interval '6 days',
  next_check_at timestamptz not null default now()
);
create index mobile_shopping_activity_due_idx on private.mobile_shopping_activity(next_check_at);
revoke all on private.mobile_shopping_activity from public, anon, authenticated;

create function private.track_mobile_shopping_activity() returns trigger language plpgsql security definer
set search_path=pg_catalog, public, private as $$
declare uid uuid := case when tg_op='DELETE' then old.user_id else new.user_id end;
begin
  -- Never trust a client-supplied cart timestamp for eligibility.
  insert into private.mobile_shopping_activity(user_id) values(uid) on conflict do nothing;
  if tg_table_name='cart_items' then
    update private.mobile_shopping_activity set cart_changed_at=clock_timestamp(),
      cart_due_at=now()+interval '24 hours'+random()*interval '24 hours', next_check_at=now()
      where user_id=uid;
  else
    update private.mobile_shopping_activity set wishlist_changed_at=clock_timestamp(),
      wishlist_due_at=now()+interval '5 days'+random()*interval '2 days', next_check_at=now()
      where user_id=uid;
  end if;
  return coalesce(new,old);
end; $$;
revoke all on function private.track_mobile_shopping_activity() from public,anon,authenticated;
create trigger track_mobile_cart after insert or update or delete on public.cart_items
  for each row execute function private.track_mobile_shopping_activity();
create trigger track_mobile_wishlist after insert or delete on public.wishlist_items
  for each row execute function private.track_mobile_shopping_activity();
insert into private.mobile_shopping_activity(user_id)
  select user_id from public.cart_items union select user_id from public.wishlist_items on conflict do nothing;

create table private.mobile_shopping_deliveries (
  notification_id bigint primary key references public.customer_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('promotion','cart_reminder','wishlist_reminder','shopping_offer')),
  revision timestamptz,
  expires_at timestamptz not null,
  status text not null default 'queued' check(status in ('queued','sending','sent','cancelled','failed')),
  attempts integer not null default 0,
  lease_id uuid,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index mobile_shopping_deliveries_due_idx on private.mobile_shopping_deliveries(next_attempt_at)
  where status in ('queued','sending');
create index mobile_shopping_deliveries_user_idx on private.mobile_shopping_deliveries(user_id,created_at desc);
create unique index mobile_shopping_revision_once on private.mobile_shopping_deliveries(user_id,kind,revision)
  where kind in ('cart_reminder','wishlist_reminder');
revoke all on private.mobile_shopping_deliveries from public,anon,authenticated;

create function private.queue_mobile_shopping_notification() returns trigger language plpgsql security definer
set search_path=pg_catalog, public, private as $$
declare revision_at timestamptz; expiry timestamptz := now()+interval '48 hours';
begin
  if new.kind not in ('promotion','cart_reminder','wishlist_reminder','shopping_offer') then return new; end if;
  select case when new.kind='cart_reminder' then cart_changed_at
    when new.kind='wishlist_reminder' then wishlist_changed_at end into revision_at
    from private.mobile_shopping_activity where user_id=new.user_id;
  if new.kind='shopping_offer' then
    select expires_at into expiry from public.mobile_loyalty_redemptions
      where id::text=new.entity_id and user_id=new.user_id and reward_source='surprise';
    if expiry is null then raise exception 'A real offer must exist before notification'; end if;
  end if;
  insert into private.mobile_shopping_deliveries(notification_id,user_id,kind,revision,expires_at)
    values(new.id,new.user_id,new.kind,revision_at,expiry);
  return new;
end; $$;
revoke all on function private.queue_mobile_shopping_notification() from public,anon,authenticated;
create trigger queue_mobile_shopping_notification after insert on public.customer_notifications
  for each row execute function private.queue_mobile_shopping_notification();

-- Re-evaluated when preparing each send, not just when initially scheduled.
create function private.mobile_shopping_eligible(uid uuid, reminder_kind text, revision_at timestamptz default null)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare prefs public.mobile_shopping_preferences; activity private.mobile_shopping_activity;
begin
  if not exists(select 1 from public.profiles where id=uid and role='customer') then return false; end if;
  if reminder_kind='promotion' then
    return exists(select 1 from public.customer_preferences where user_id=uid and home_circle_notes);
  end if;
  select * into prefs from public.mobile_shopping_preferences where user_id=uid;
  if not found then return false; end if;
  if not (case reminder_kind when 'cart_reminder' then prefs.cart when 'wishlist_reminder' then prefs.wishlist
    when 'shopping_offer' then prefs.offers else false end) then return false; end if;
  -- Never nudge somebody whose checkout is awaiting payment, or who just bought.
  if exists(select 1 from public.orders where user_id=uid and status<>'cancelled' and
    ((status='pending' and payment_status='pending') or created_at>now()-interval '48 hours')) then return false; end if;
  select * into activity from private.mobile_shopping_activity where user_id=uid;
  if reminder_kind='cart_reminder' then
    if revision_at is distinct from activity.cart_changed_at then return false; end if;
    return exists(select 1 from public.cart_items c join public.products p on p.id=c.product_id
      where c.user_id=uid and p.status='active' and p.stock_quantity>=c.quantity
      and not exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id
        where o.user_id=uid and oi.product_id=c.product_id and o.status<>'cancelled'
          and o.payment_status not in ('failed','refunded') and o.created_at>=revision_at));
  elsif reminder_kind='wishlist_reminder' then
    if revision_at is distinct from activity.wishlist_changed_at then return false; end if;
    return exists(select 1 from public.wishlist_items w join public.products p on p.id=w.product_id
      where w.user_id=uid and p.status='active' and p.stock_quantity>0
      and not exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id
        where o.user_id=uid and oi.product_id=w.product_id and o.status<>'cancelled'
          and o.payment_status not in ('failed','refunded') and o.created_at>=w.created_at));
  end if;
  return reminder_kind='shopping_offer';
end; $$;
revoke all on function private.mobile_shopping_eligible(uuid,text,timestamptz) from public,anon,authenticated;

-- Use the larger of the calendar-month and rolling-30-day windows. A month
-- change must not free a fresh budget immediately after the previous allocation.
create function private.mobile_shopping_budget_start(p_at timestamptz)
returns timestamptz language sql stable set search_path=pg_catalog as $$
  select least(date_trunc('month',p_at at time zone 'Asia/Manila') at time zone 'Asia/Manila',
    p_at - interval '720 hours');
$$;
revoke all on function private.mobile_shopping_budget_start(timestamptz) from public,anon,authenticated;

create function private.run_mobile_shopping_campaigns() returns integer language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare a record; rules private.mobile_shopping_rules; k text; title_text text; body_text text;
  entity text; offer_id uuid; made integer:=0; committed_budget numeric; local_hour integer;
begin
  -- Serialize issuance and the budget reservation across overlapping cron runs.
  if not pg_try_advisory_xact_lock(240924,1) then return 0; end if;
  select * into rules from private.mobile_shopping_rules where id for update;
  if not rules.enabled then return 0; end if;
  select coalesce(sum(discount_amount),0) into committed_budget from public.mobile_loyalty_redemptions
    where reward_source='surprise' and created_at>=private.mobile_shopping_budget_start(now());
  for a in select activity.*, prefs.timezone, prefs.offers from private.mobile_shopping_activity activity
    join public.mobile_shopping_preferences prefs using(user_id)
    where activity.next_check_at<=now() and (prefs.offers or prefs.cart or prefs.wishlist)
    order by activity.next_check_at limit 100 for update of activity skip locked
  loop
    update private.mobile_shopping_activity set next_check_at=now()+interval '1 hour' where user_id=a.user_id;
    local_hour:=extract(hour from now() at time zone a.timezone);
    if local_hour<10 or local_hour>=19 then continue; end if;
    if not exists(select 1 from public.mobile_push_tokens where user_id=a.user_id and active and shopping_supported and platform in ('ios','android')) then continue; end if;
    if exists(select 1 from private.mobile_shopping_deliveries where user_id=a.user_id and
      (status in ('queued','sending') or (status='sent' and sent_at>now()-interval '48 hours'))) then continue; end if;
    if (select count(*) from private.mobile_shopping_deliveries where user_id=a.user_id and status='sent'
      and sent_at>now()-interval '7 days')>=2 then continue; end if;
    k:=null; entity:=null; offer_id:=null;
    -- An account-bound, storewide voucher reuses the existing atomic checkout
    -- redemption checks. Budget counts face value issued, not optimistic usage.
    if rules.offers_enabled and a.offers and (a.cart_due_at<=now() or a.wishlist_due_at<=now()) and committed_budget+rules.discount_amount<=rules.monthly_budget
      and private.mobile_shopping_eligible(a.user_id,'shopping_offer')
      and exists(select 1 from public.profiles where id=a.user_id and created_at<now()-interval '7 days')
      and not exists(select 1 from public.mobile_loyalty_redemptions where user_id=a.user_id and
        ((status='available' and expires_at>now()) or (reward_source='surprise' and created_at>now()-interval '30 days')))
      and (exists(select 1 from public.cart_items c join public.products p on p.id=c.product_id where c.user_id=a.user_id and p.status='active' and p.stock_quantity>=c.quantity)
        or exists(select 1 from public.wishlist_items w join public.products p on p.id=w.product_id where w.user_id=a.user_id and p.status='active' and p.stock_quantity>0)) then
      insert into public.mobile_loyalty_redemptions(user_id,points_cost,discount_amount,reward_source,minimum_order_amount,code,expires_at)
        values(a.user_id,0,rules.discount_amount,'surprise',rules.minimum_order_amount,
          'COZY-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),now()+make_interval(hours=>rules.offer_hours)) returning id into offer_id;
      committed_budget:=committed_budget+rules.discount_amount;
      k:='shopping_offer'; entity:=offer_id::text;
      title_text:='A little comfort, just for you';
      body_text:=format('Your Cozy Surprise: PHP %s off with a PHP %s merchandise minimum. Tap for the expiry and details.',rules.discount_amount,rules.minimum_order_amount);
    elsif a.cart_due_at<=now() and private.mobile_shopping_eligible(a.user_id,'cart_reminder',a.cart_changed_at)
      and not exists(select 1 from private.mobile_shopping_deliveries where user_id=a.user_id and kind='cart_reminder' and revision=a.cart_changed_at) then
      k:='cart_reminder'; entity:='bag';
      title_text:=case when random()<0.5 then 'Your next cozy corner?' else 'A little comfort is in your bag' end;
      body_text:='You have pieces saved in your bag. Take another look whenever you are ready.';
    elsif a.wishlist_due_at<=now() and private.mobile_shopping_eligible(a.user_id,'wishlist_reminder',a.wishlist_changed_at)
      and not exists(select 1 from private.mobile_shopping_deliveries where user_id=a.user_id and kind='wishlist_reminder' and revision=a.wishlist_changed_at) then
      k:='wishlist_reminder'; entity:='saved';
      title_text:=case when random()<0.5 then 'Still thinking about your favorites?' else 'A home for your favorite pieces' end;
      body_text:='Revisit the pieces you saved and find what feels right for your home.';
    end if;
    if k is not null then
      insert into public.customer_notifications(user_id,kind,title,message,entity_type,entity_id)
        values(a.user_id,k,title_text,body_text,case when k='shopping_offer' then 'mobile_reward' else 'shopping_reminder' end,entity);
      made:=made+1;
    end if;
  end loop;
  return made;
end; $$;
revoke all on function private.run_mobile_shopping_campaigns() from public,anon,authenticated;

-- Only the authenticated push worker can acquire a five-minute lease. These
-- RPCs are not callable by customer sessions, including anonymous users.
create function public.due_mobile_shopping_pushes() returns setof bigint language sql security definer
set search_path=pg_catalog,public,private as $$
  select notification_id from private.mobile_shopping_deliveries
  where status in ('queued','sending') and next_attempt_at<=now()
  order by next_attempt_at limit 20;
$$;
create function public.prepare_mobile_shopping_push(p_notification_id bigint) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare d private.mobile_shopping_deliveries; n public.customer_notifications; tz text; hour_now integer; lock_token uuid;
begin
  select * into d from private.mobile_shopping_deliveries where notification_id=p_notification_id for update;
  if not found or d.status not in ('queued','sending') or d.next_attempt_at>now() then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.user_id::text,240924));
  select * into n from public.customer_notifications where id=p_notification_id;
  if d.expires_at<=now() or d.attempts>=5 or not private.mobile_shopping_eligible(d.user_id,d.kind,d.revision)
    or not (select enabled from private.mobile_shopping_rules where id)
    or (d.kind='shopping_offer' and not exists(select 1 from public.mobile_loyalty_redemptions
      where id::text=n.entity_id and user_id=d.user_id and status='available' and expires_at>now())) then
    update private.mobile_shopping_deliveries set status='cancelled' where notification_id=p_notification_id;
    return null;
  end if;
  select timezone into tz from public.mobile_shopping_preferences where user_id=d.user_id;
  hour_now:=extract(hour from now() at time zone coalesce(tz,'Asia/Manila'));
  if hour_now<10 or hour_now>=19 or
    exists(select 1 from private.mobile_shopping_deliveries where user_id=d.user_id and notification_id<>d.notification_id
      and ((status='sent' and sent_at>now()-interval '48 hours') or (status='sending' and next_attempt_at>now()))) or
    (select count(*) from private.mobile_shopping_deliveries where user_id=d.user_id and status='sent' and sent_at>now()-interval '7 days')>=2 then
    update private.mobile_shopping_deliveries set status='queued',next_attempt_at=now()+interval '1 hour' where notification_id=p_notification_id;
    return null;
  end if;
  lock_token:=gen_random_uuid();
  update private.mobile_shopping_deliveries set status='sending',attempts=attempts+1,lease_id=lock_token,
    next_attempt_at=now()+interval '5 minutes' where notification_id=p_notification_id;
  return to_jsonb(n)||jsonb_build_object('expires_at',d.expires_at,'lease_id',lock_token);
end; $$;
create function public.finish_mobile_shopping_push(p_notification_id bigint,p_lease_id uuid,p_sent boolean)
returns void language sql security definer set search_path=pg_catalog,public,private as $$
  update private.mobile_shopping_deliveries set status=case when p_sent then 'sent' when attempts>=5 then 'failed' else 'queued' end,
    sent_at=case when p_sent then now() else sent_at end,
    next_attempt_at=now()+make_interval(mins=>least(60,5*(2^attempts)::integer))
  where notification_id=p_notification_id and lease_id=p_lease_id and status='sending';
$$;
revoke all on function public.due_mobile_shopping_pushes() from public,anon,authenticated;
revoke all on function public.prepare_mobile_shopping_push(bigint) from public,anon,authenticated;
revoke all on function public.finish_mobile_shopping_push(bigint,uuid,boolean) from public,anon,authenticated;
grant execute on function public.due_mobile_shopping_pushes() to service_role;
grant execute on function public.prepare_mobile_shopping_push(bigint) to service_role;
grant execute on function public.finish_mobile_shopping_push(bigint,uuid,boolean) to service_role;

create function private.tick_mobile_shopping_notifications() returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare project_url text; webhook_secret text;
begin
  perform private.run_mobile_shopping_campaigns();
  if not exists(select 1 from private.mobile_shopping_deliveries where status in ('queued','sending') and next_attempt_at<=now()) then return; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='cozycraft_project_url' limit 1;
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name='customer_push_webhook_secret' limit 1;
  if project_url is null or webhook_secret is null then raise warning 'Shopping push dispatch is not configured'; return; end if;
  perform net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/send-mobile-push',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||webhook_secret),
    body:='{"shoppingQueue":true}'::jsonb, timeout_milliseconds:=5000);
end; $$;
revoke all on function private.tick_mobile_shopping_notifications() from public,anon,authenticated;
-- Supabase installs pg_cron in pg_catalog. A stable name replaces, not duplicates, the job.
select cron.schedule('cozycraft-mobile-shopping-reminders','*/15 * * * *','select private.tick_mobile_shopping_notifications()');

comment on table private.mobile_shopping_rules is 'Conservative automatic-offer pilot: PHP 100 off PHP 10000 merchandise, PHP 1000 issued-value cap across both Manila calendar month and rolling 30 days. Not a profit guarantee. Set enabled=false to stop marketing sends.';
comment on table private.mobile_shopping_deliveries is 'Shared cap across offers, cart, wishlist and store announcements: 2 accepted sends per rolling 7 days, 48 hour spacing, 10-19 local. Five leased attempts; expired/withdrawn campaigns cancelled.';

-- Complete first-time Google customer setup inside the mobile app and issue a
-- single database-backed welcome reward. The RPCs are intentionally
-- idempotent so a repeated native callback or a lost response cannot create a
-- second voucher.

alter table public.mobile_loyalty_redemptions
  add column if not exists reward_source text not null default 'points',
  add column if not exists minimum_order_amount numeric(12,2) not null default 0;

alter table public.mobile_loyalty_redemptions
  drop constraint if exists mobile_loyalty_redemptions_points_cost_check,
  drop constraint if exists mobile_loyalty_redemptions_discount_amount_check,
  drop constraint if exists mobile_loyalty_redemptions_reward_source_check,
  drop constraint if exists mobile_loyalty_redemptions_minimum_order_amount_check,
  add constraint mobile_loyalty_redemptions_points_cost_check
    check (points_cost in (0, 100, 250, 500)),
  add constraint mobile_loyalty_redemptions_discount_amount_check
    check (discount_amount in (100, 300, 500, 700)),
  add constraint mobile_loyalty_redemptions_reward_source_check
    check (
      (reward_source = 'points' and points_cost in (100, 250, 500))
      or (reward_source = 'welcome' and points_cost = 0)
    ),
  add constraint mobile_loyalty_redemptions_minimum_order_amount_check
    check (minimum_order_amount >= 0);

create unique index if not exists mobile_loyalty_one_welcome_reward_idx
  on public.mobile_loyalty_redemptions (user_id)
  where reward_source = 'welcome';

create table if not exists public.mobile_google_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  voucher_id uuid references public.mobile_loyalty_redemptions(id) on delete set null,
  completed_at timestamptz not null default now(),
  voucher_seen_at timestamptz
);

alter table public.mobile_google_onboarding enable row level security;
revoke all on public.mobile_google_onboarding from public, anon, authenticated;

create or replace function private.mobile_user_has_google_identity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from auth.identities
    where user_id = p_user_id
      and provider = 'google'
  )
$$;

revoke all on function private.mobile_user_has_google_identity(uuid) from public, anon, authenticated;

create or replace function private.mobile_google_onboarding_payload(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_username text := '';
  v_is_google boolean := false;
  v_onboarding public.mobile_google_onboarding%rowtype;
  v_voucher public.mobile_loyalty_redemptions%rowtype;
  v_show_voucher boolean := false;
begin
  select trim(coalesce(username, ''))
    into v_username
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Customer profile not found' using errcode = 'P0002';
  end if;

  v_is_google := private.mobile_user_has_google_identity(p_user_id);

  select *
    into v_onboarding
  from public.mobile_google_onboarding
  where user_id = p_user_id;

  if v_onboarding.voucher_id is not null then
    select *
      into v_voucher
    from public.mobile_loyalty_redemptions
    where id = v_onboarding.voucher_id
      and user_id = p_user_id;

    v_show_voucher := found
      and v_onboarding.voucher_seen_at is null
      and v_voucher.status = 'available'
      and v_voucher.expires_at > now();
  end if;

  return jsonb_build_object(
    'userId', p_user_id,
    'isGoogle', v_is_google,
    'needsUsername', v_is_google and v_username = '',
    'username', v_username,
    'showVoucher', v_show_voucher,
    'voucher', case
      when v_show_voucher then jsonb_build_object(
        'id', v_voucher.id,
        'code', v_voucher.code,
        'discountAmount', v_voucher.discount_amount,
        'minimumOrderAmount', v_voucher.minimum_order_amount,
        'expiresAt', v_voucher.expires_at
      )
      else null
    end
  );
end;
$$;

revoke all on function private.mobile_google_onboarding_payload(uuid) from public, anon, authenticated;

create or replace function public.get_mobile_google_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return private.mobile_google_onboarding_payload(v_user);
end;
$$;

create or replace function public.complete_mobile_google_onboarding(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_username text := trim(coalesce(p_username, ''));
  v_existing_username text := '';
  v_existing_onboarding public.mobile_google_onboarding%rowtype;
  v_voucher_id uuid;
  v_created_at timestamptz;
  v_welcome_eligible boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.mobile_user_has_google_identity(v_user) then
    raise exception 'Google customer account required' using errcode = '42501';
  end if;
  if v_username !~ '^[A-Za-z0-9._-]{3,24}$' then
    raise exception 'Use 3-24 letters, numbers, dots, underscores, or hyphens.'
      using errcode = '22023';
  end if;

  select trim(coalesce(username, ''))
    into v_existing_username
  from public.profiles
  where id = v_user
  for update;

  if not found then
    raise exception 'Customer profile not found' using errcode = 'P0002';
  end if;

  select *
    into v_existing_onboarding
  from public.mobile_google_onboarding
  where user_id = v_user;

  if v_existing_username <> '' then
    if v_existing_onboarding.user_id is not null
       and lower(v_existing_username) = lower(v_username) then
      return private.mobile_google_onboarding_payload(v_user);
    end if;
    raise exception 'Username setup is already complete' using errcode = '23505';
  end if;

  -- The unique lower(username) index remains the final authority for races.
  update public.profiles
  set
    username = v_username,
    avatar_url = case
      when lower(coalesce(avatar_url, '')) like '%googleusercontent.com%'
        then null
      else avatar_url
    end
  where id = v_user;

  select created_at
    into v_created_at
  from auth.users
  where id = v_user;

  v_welcome_eligible := v_created_at >= now() - interval '30 days'
    and not exists (
      select 1
      from public.orders
      where user_id = v_user
    );

  select id
    into v_voucher_id
  from public.mobile_loyalty_redemptions
  where user_id = v_user
    and reward_source = 'welcome'
  order by created_at
  limit 1;

  if v_voucher_id is null and v_welcome_eligible then
    insert into public.mobile_loyalty_redemptions (
      user_id,
      points_cost,
      discount_amount,
      reward_source,
      minimum_order_amount,
      code,
      expires_at
    )
    values (
      v_user,
      0,
      500,
      'welcome',
      5000,
      'WELCOME-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      now() + interval '30 days'
    )
    returning id into v_voucher_id;
  end if;

  insert into public.mobile_google_onboarding (
    user_id,
    username,
    voucher_id,
    completed_at
  )
  values (
    v_user,
    v_username,
    v_voucher_id,
    now()
  )
  on conflict (user_id) do update
  set
    username = excluded.username,
    voucher_id = coalesce(public.mobile_google_onboarding.voucher_id, excluded.voucher_id),
    completed_at = coalesce(public.mobile_google_onboarding.completed_at, excluded.completed_at);

  return private.mobile_google_onboarding_payload(v_user);
end;
$$;

create or replace function public.acknowledge_mobile_welcome_voucher()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.mobile_google_onboarding
  set voucher_seen_at = coalesce(voucher_seen_at, now())
  where user_id = v_user;

  return private.mobile_google_onboarding_payload(v_user);
end;
$$;

-- Welcome vouchers share the existing atomic redemption lifecycle, with one
-- additional server-enforced merchandise minimum.
create or replace function public.apply_mobile_reward_to_order(p_order_id uuid, p_redemption_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders;
  v_reward public.mobile_loyalty_redemptions;
  v_discount numeric(12,2);
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_order from public.orders
    where id = p_order_id and user_id = v_user for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.home_circle_redemption_id = p_redemption_id then
    return v_order;
  end if;
  if v_order.home_circle_redemption_id is not null then
    raise exception 'This order already has a Home Circle reward';
  end if;
  if v_order.status in ('cancelled','delivered') or v_order.payment_status in ('paid','refunded','failed') then
    raise exception 'This order can no longer accept a reward';
  end if;

  select * into v_reward from public.mobile_loyalty_redemptions
    where id = p_redemption_id and user_id = v_user for update;
  if not found or v_reward.status <> 'available' or v_reward.expires_at <= now() then
    raise exception 'This Home Circle reward is unavailable or expired';
  end if;
  if coalesce(v_order.subtotal, v_order.total) < v_reward.minimum_order_amount then
    raise exception 'This reward requires a merchandise subtotal of at least PHP %', v_reward.minimum_order_amount;
  end if;

  v_discount := least(v_reward.discount_amount, greatest(v_order.total - 1, 0));
  if v_discount <= 0 then raise exception 'This order cannot use the selected reward'; end if;

  update public.orders set
    total = total - v_discount,
    reward_discount = v_discount,
    home_circle_redemption_id = v_reward.id,
    updated_at = now()
  where id = v_order.id returning * into v_order;

  update public.mobile_loyalty_redemptions
    set status = 'applied', used_at = now()
    where id = v_reward.id;
  return v_order;
end;
$$;

revoke all on function public.get_mobile_google_onboarding() from public, anon;
revoke all on function public.complete_mobile_google_onboarding(text) from public, anon;
revoke all on function public.acknowledge_mobile_welcome_voucher() from public, anon;
revoke all on function public.apply_mobile_reward_to_order(uuid, uuid) from public, anon;

grant execute on function public.get_mobile_google_onboarding() to authenticated;
grant execute on function public.complete_mobile_google_onboarding(text) to authenticated;
grant execute on function public.acknowledge_mobile_welcome_voucher() to authenticated;
grant execute on function public.apply_mobile_reward_to_order(uuid, uuid) to authenticated;

comment on table public.mobile_google_onboarding is
  'Idempotent completion and one-time welcome presentation state for Google customers in the mobile app.';
comment on column public.mobile_loyalty_redemptions.minimum_order_amount is
  'Server-enforced merchandise subtotal required before a reward can be applied.';

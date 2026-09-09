-- Manual and Google customers share the existing reward/acknowledgement
-- lifecycle. Keep the old Google RPCs compatible with installed older apps.
create or replace function public.get_mobile_customer_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_username text;
  v_role text;
  v_created_at timestamptz;
  v_verified_at timestamptz;
  v_voucher_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- The same row lock used by Google completion serializes welcome issuance.
  select trim(coalesce(username, '')), role::text
    into v_username, v_role
  from public.profiles where id = v_user for update;
  if not found or v_role is distinct from 'customer' then
    raise exception 'Customer account required' using errcode = '42501';
  end if;

  -- Google accounts still complete their name/username setup before issuance.
  if private.mobile_user_has_google_identity(v_user) then
    return private.mobile_google_onboarding_payload(v_user);
  end if;

  select created_at, email_confirmed_at into v_created_at, v_verified_at
  from auth.users where id = v_user;
  -- Reward eligibility is never taken from editable tutorial/user metadata.
  if v_verified_at is null then
    return private.mobile_google_onboarding_payload(v_user);
  end if;

  select id into v_voucher_id from public.mobile_loyalty_redemptions
  where user_id = v_user and reward_source = 'welcome';

  if v_voucher_id is null
     and v_created_at >= now() - interval '30 days'
     and not exists (select 1 from public.orders where user_id = v_user) then
    insert into public.mobile_loyalty_redemptions (
      user_id, points_cost, discount_amount, reward_source,
      minimum_order_amount, code, expires_at
    ) values (
      v_user, 0, 500, 'welcome', 5000,
      'WELCOME-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      now() + interval '30 days'
    )
    on conflict (user_id) where reward_source = 'welcome' do nothing
    returning id into v_voucher_id;
    if v_voucher_id is null then
      select id into v_voucher_id from public.mobile_loyalty_redemptions
      where user_id = v_user and reward_source = 'welcome';
    end if;
  end if;

  if v_voucher_id is not null then
    insert into public.mobile_google_onboarding (user_id, username, voucher_id)
    values (v_user, v_username, v_voucher_id)
    on conflict (user_id) do update set
      username = excluded.username,
      voucher_id = coalesce(public.mobile_google_onboarding.voucher_id, excluded.voucher_id);
    -- In particular, never clear voucher_seen_at, reset expiry, or replace an
    -- applied/expired reward when the app retries, resumes, or a tour replays.
  end if;
  return private.mobile_google_onboarding_payload(v_user);
end;
$$;

revoke all on function public.get_mobile_customer_onboarding() from public, anon;
grant execute on function public.get_mobile_customer_onboarding() to authenticated;
comment on function public.get_mobile_customer_onboarding() is
  'Mobile welcome state for authenticated customers. Verified manual signups use the existing one-per-account welcome reward, eligibility and acknowledgement rules.';
notify pgrst, 'reload schema';

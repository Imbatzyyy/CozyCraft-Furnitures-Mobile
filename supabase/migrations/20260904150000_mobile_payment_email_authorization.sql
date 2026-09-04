-- GCash and card checkouts started by the customer mobile app require a
-- short-lived email challenge. Codes and challenge rows are server-only;
-- authenticated clients receive only an opaque challenge id.

create table if not exists public.mobile_payment_email_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  checkout_key uuid not null,
  payment_method text not null check (payment_method in ('card', 'gcash')),
  intent_digest text not null check (intent_digest ~ '^[0-9a-f]{64}$'),
  code_digest text not null check (char_length(code_digest) = 64),
  provider_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'verified', 'consumed', 'expired', 'locked')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  consumed_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,
  last_error_code text
);

create index if not exists mobile_payment_email_user_created_idx
  on public.mobile_payment_email_challenges (user_id, created_at desc);

create index if not exists mobile_payment_email_checkout_idx
  on public.mobile_payment_email_challenges (user_id, checkout_key);

-- Keep one usable challenge as a final database invariant. Issuance rate
-- serialization is enforced by the forward reservation migration; the index
-- remains defense in depth for unexpected status-transition paths.
create unique index if not exists mobile_payment_email_one_active_idx
  on public.mobile_payment_email_challenges (user_id)
  where status in ('pending', 'sent', 'verified');

alter table public.mobile_payment_email_challenges enable row level security;
revoke all on table public.mobile_payment_email_challenges from public, anon, authenticated;
grant all on table public.mobile_payment_email_challenges to service_role;

-- This check runs immediately before an online order is reserved. A consumed
-- challenge remains valid only for its original idempotent checkout key, which
-- lets a safely retried PayMongo request recover the same order.
create or replace function public.mobile_payment_authorization_valid(
  p_challenge_id uuid,
  p_checkout_key uuid,
  p_payment_method text,
  p_intent_digest text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mobile_payment_email_challenges challenge
    where challenge.id = p_challenge_id
      and challenge.user_id = (select auth.uid())
      and challenge.checkout_key = p_checkout_key
      and challenge.payment_method = p_payment_method
      and challenge.intent_digest = p_intent_digest
      and (
        (challenge.status = 'verified' and challenge.expires_at > statement_timestamp())
        or (challenge.status = 'consumed' and challenge.order_id is not null)
      )
  );
$$;

revoke all on function public.mobile_payment_authorization_valid(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.mobile_payment_authorization_valid(uuid, uuid, text, text)
  to authenticated;

-- Consumption is atomic and idempotent. The first call binds the authorization
-- to one owned order; a network retry succeeds only for that exact same order.
create or replace function public.consume_mobile_payment_authorization(
  p_challenge_id uuid,
  p_checkout_key uuid,
  p_payment_method text,
  p_intent_digest text,
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_challenge public.mobile_payment_email_challenges%rowtype;
begin
  if v_user_id is null then
    return false;
  end if;

  select challenge.*
  into v_challenge
  from public.mobile_payment_email_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.user_id = v_user_id
    and challenge.checkout_key = p_checkout_key
    and challenge.payment_method = p_payment_method
    and challenge.intent_digest = p_intent_digest
  for update;

  if not found then
    return false;
  end if;

  if not exists (
    select 1
    from public.orders customer_order
    where customer_order.id = p_order_id
      and customer_order.user_id = v_user_id
      and customer_order.checkout_key = p_checkout_key
      and customer_order.payment_method = p_payment_method
  ) then
    return false;
  end if;

  if v_challenge.status = 'consumed' then
    return v_challenge.order_id = p_order_id;
  end if;

  if v_challenge.status <> 'verified'
     or v_challenge.expires_at <= statement_timestamp() then
    return false;
  end if;

  update public.mobile_payment_email_challenges
  set status = 'consumed',
      consumed_at = statement_timestamp(),
      order_id = p_order_id
  where id = v_challenge.id;

  return true;
end;
$function$;

revoke all on function public.consume_mobile_payment_authorization(uuid, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.consume_mobile_payment_authorization(uuid, uuid, text, text, uuid)
  to authenticated;

-- The service function compares the submitted HMAC digest, increments failed
-- attempts, and changes status under one row lock. Keeping this server-only
-- prevents parallel requests from bypassing the five-attempt limit.
create or replace function public.verify_mobile_payment_code(
  p_challenge_id uuid,
  p_user_id uuid,
  p_code_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_challenge public.mobile_payment_email_challenges%rowtype;
  v_latest_id uuid;
  v_attempts smallint;
  v_now timestamptz := statement_timestamp();
begin
  if p_challenge_id is null
     or p_user_id is null
     or p_code_digest is null
     or p_code_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'missing');
  end if;

  select challenge.*
  into v_challenge
  from public.mobile_payment_email_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;

  if v_challenge.status <> 'sent' or v_challenge.attempts >= 5 then
    return jsonb_build_object('outcome', 'unusable');
  end if;

  select challenge.id
  into v_latest_id
  from public.mobile_payment_email_challenges challenge
  where challenge.user_id = p_user_id
    and challenge.status in ('pending', 'sent', 'verified')
  order by challenge.created_at desc, challenge.id desc
  limit 1;

  if v_latest_id is distinct from v_challenge.id then
    return jsonb_build_object('outcome', 'newer');
  end if;

  if v_challenge.expires_at <= v_now then
    update public.mobile_payment_email_challenges
    set status = 'expired'
    where id = v_challenge.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  if v_challenge.code_digest = p_code_digest then
    update public.mobile_payment_email_challenges
    set status = 'verified',
        verified_at = v_now
    where id = v_challenge.id;

    return jsonb_build_object(
      'outcome', 'verified',
      'authorization_id', v_challenge.id,
      'checkout_key', v_challenge.checkout_key,
      'payment_method', v_challenge.payment_method,
      'expires_at', v_challenge.expires_at,
      'verified_at', v_now
    );
  end if;

  v_attempts := v_challenge.attempts + 1;
  update public.mobile_payment_email_challenges
  set attempts = v_attempts,
      status = case when v_attempts >= 5 then 'locked' else 'sent' end
  where id = v_challenge.id;

  return jsonb_build_object(
    'outcome', 'incorrect',
    'attempts_remaining', greatest(0, 5 - v_attempts)
  );
end;
$function$;

revoke all on function public.verify_mobile_payment_code(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.verify_mobile_payment_code(uuid, uuid, text)
  to service_role;

comment on table public.mobile_payment_email_challenges is
  'Server-only, short-lived email authorizations for mobile GCash and card checkout.';
comment on function public.mobile_payment_authorization_valid(uuid, uuid, text, text) is
  'Checks that the signed-in customer authorized this exact mobile payment intent.';
comment on function public.consume_mobile_payment_authorization(uuid, uuid, text, text, uuid) is
  'Atomically binds a verified mobile payment challenge to one idempotent order.';
comment on function public.verify_mobile_payment_code(uuid, uuid, text) is
  'Server-only atomic verification and attempt limiting for mobile payment email codes.';

-- Fail the migration instead of silently deploying a weakened permission
-- model if a future schema default changes these security invariants.
do $validation$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'mobile_payment_email_challenges'
      and relation.relrowsecurity
  ) then
    raise exception 'mobile payment challenge RLS must be enabled';
  end if;

  if has_table_privilege('authenticated', 'public.mobile_payment_email_challenges', 'select')
     or has_function_privilege(
       'authenticated',
       'public.verify_mobile_payment_code(uuid,uuid,text)',
       'execute'
     ) then
    raise exception 'mobile payment challenge secrets must remain server-only';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.mobile_payment_authorization_valid(uuid,uuid,text,text)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.consume_mobile_payment_authorization(uuid,uuid,text,text,uuid)',
       'execute'
     ) then
    raise exception 'authenticated checkout authorization functions are unavailable';
  end if;
end;
$validation$;

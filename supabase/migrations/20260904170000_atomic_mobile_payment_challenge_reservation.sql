-- Serialize payment-code issuance per customer before any email is sent.
-- The prior Edge implementation checked cooldown/hourly limits and inserted
-- the challenge through separate HTTP transactions, so concurrent requests
-- could all pass a stale count. This service-only RPC makes that reservation
-- one database transaction while preserving the rolling-window count and
-- response contract. The cooldown applies to every issuance attempt so a
-- rapid failed, locked, consumed, or replaced challenge cannot trigger a new
-- email inside the same minute.

create or replace function public.reserve_mobile_payment_challenge(
  p_challenge_id uuid,
  p_user_id uuid,
  p_email text,
  p_checkout_key uuid,
  p_payment_method text,
  p_intent_digest text,
  p_code_digest text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_email text := lower(btrim(p_email));
  v_latest_request_at timestamptz;
  v_fifth_recent_at timestamptz;
  v_retry_after integer;
begin
  if p_challenge_id is null
     or p_user_id is null
     or p_checkout_key is null
     or v_email is null
     or char_length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_payment_method is null
     or p_payment_method not in ('card', 'gcash')
     or p_intent_digest is null
     or p_intent_digest !~ '^[0-9a-f]{64}$'
     or p_code_digest is null
     or p_code_digest !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '6 minutes' then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  -- Every device and session for one account shares this transaction lock.
  -- A challenge or checkout-key lock would not serialize two first requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 20260904170000)
  );

  -- Preserve response precedence: a request inside the one-minute resend
  -- window reports cooldown before the hourly request cap. Every terminal
  -- status participates because the cooldown limits issuance, not usability.
  select challenge.created_at
  into v_latest_request_at
  from public.mobile_payment_email_challenges challenge
  where challenge.user_id = p_user_id
  order by challenge.created_at desc, challenge.id desc
  limit 1;

  if v_latest_request_at is not null
     and v_latest_request_at > v_now - interval '60 seconds' then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (
        v_latest_request_at + interval '60 seconds' - v_now
      )))::integer
    );
    return jsonb_build_object(
      'outcome', 'cooldown',
      'retry_after', v_retry_after
    );
  end if;

  -- The fifth-newest row controls when a rolling five-request window opens.
  -- All statuses count, including failed delivery, expired, consumed, and
  -- locked rows, matching the released behavior.
  select challenge.created_at
  into v_fifth_recent_at
  from public.mobile_payment_email_challenges challenge
  where challenge.user_id = p_user_id
    and challenge.created_at >= v_now - interval '1 hour'
  order by challenge.created_at desc, challenge.id desc
  offset 4
  limit 1;

  if v_fifth_recent_at is not null then
    v_retry_after := ceil(extract(epoch from (
      v_fifth_recent_at + interval '1 hour' - v_now
    )))::integer;
    if v_retry_after > 0 then
      return jsonb_build_object(
        'outcome', 'hourly_limit',
        'retry_after', v_retry_after
      );
    end if;
  end if;

  update public.mobile_payment_email_challenges
  set status = 'expired'
  where user_id = p_user_id
    and status in ('pending', 'sent', 'verified');

  insert into public.mobile_payment_email_challenges (
    id,
    user_id,
    email,
    checkout_key,
    payment_method,
    intent_digest,
    code_digest,
    status,
    expires_at,
    created_at
  ) values (
    p_challenge_id,
    p_user_id,
    v_email,
    p_checkout_key,
    p_payment_method,
    p_intent_digest,
    p_code_digest,
    'pending',
    p_expires_at,
    v_now
  );

  return jsonb_build_object(
    'outcome', 'reserved',
    'challenge_id', p_challenge_id,
    'expires_at', p_expires_at
  );
end;
$function$;

-- Keep the invariant at the table boundary as well as the RPC boundary. This
-- protects an already-running prior Edge deployment during a database-first
-- rollout and prevents any future privileged insert path from omitting the
-- per-user serialization. The public RPC still owns user-facing outcomes and
-- retry timing; this trigger is a fail-closed guard.
create or replace function private.guard_mobile_payment_challenge_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_latest_request_at timestamptz;
  v_fifth_recent_at timestamptz;
begin
  if new.user_id is null then
    raise exception using
      errcode = '23502',
      message = 'mobile payment challenge user is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 20260904170000)
  );

  select challenge.created_at
  into v_latest_request_at
  from public.mobile_payment_email_challenges challenge
  where challenge.user_id = new.user_id
  order by challenge.created_at desc, challenge.id desc
  limit 1;

  if v_latest_request_at is not null
     and v_latest_request_at > v_now - interval '60 seconds' then
    raise exception using
      errcode = 'P0001',
      message = 'mobile_payment_challenge_cooldown';
  end if;

  select challenge.created_at
  into v_fifth_recent_at
  from public.mobile_payment_email_challenges challenge
  where challenge.user_id = new.user_id
    and challenge.created_at >= v_now - interval '1 hour'
  order by challenge.created_at desc, challenge.id desc
  offset 4
  limit 1;

  if v_fifth_recent_at is not null
     and v_fifth_recent_at + interval '1 hour' > v_now then
    raise exception using
      errcode = 'P0001',
      message = 'mobile_payment_challenge_hourly_limit';
  end if;

  new.created_at := v_now;
  return new;
end;
$function$;

revoke all on function private.guard_mobile_payment_challenge_insert()
  from public, anon, authenticated;

drop trigger if exists guard_mobile_payment_challenge_insert
  on public.mobile_payment_email_challenges;
create trigger guard_mobile_payment_challenge_insert
before insert on public.mobile_payment_email_challenges
for each row execute function private.guard_mobile_payment_challenge_insert();

revoke all on function public.reserve_mobile_payment_challenge(
  uuid, uuid, text, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_mobile_payment_challenge(
  uuid, uuid, text, uuid, text, text, text, timestamptz
) to service_role;

comment on function public.reserve_mobile_payment_challenge(
  uuid, uuid, text, uuid, text, text, text, timestamptz
) is 'Atomically enforces mobile payment OTP cooldown and hourly issuance limits before reserving one challenge.';
comment on function private.guard_mobile_payment_challenge_insert() is
  'Fail-closed insert guard for per-customer mobile payment OTP issuance limits.';

-- Fail closed if deployment ever broadens this server-only boundary.
do $validation$
begin
  if has_function_privilege(
       'anon',
       'public.reserve_mobile_payment_challenge(uuid,uuid,text,uuid,text,text,text,timestamptz)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.reserve_mobile_payment_challenge(uuid,uuid,text,uuid,text,text,text,timestamptz)',
       'execute'
     ) then
    raise exception 'payment challenge reservation must remain server-only';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.reserve_mobile_payment_challenge(uuid,uuid,text,uuid,text,text,text,timestamptz)',
       'execute'
     ) then
    raise exception 'service role cannot reserve payment challenges';
  end if;
end;
$validation$;

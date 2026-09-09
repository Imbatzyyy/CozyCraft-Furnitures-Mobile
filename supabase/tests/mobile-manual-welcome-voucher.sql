-- Run in one transaction and always roll it back. Fixtures use reserved
-- example.invalid addresses, never invoke Auth signup, and send no emails.
begin;
do $test$
declare
  u uuid;
  scenario text;
  one jsonb;
  two jsonb;
  reward uuid;
  expiry timestamptz;
  denied boolean;
begin
  if has_function_privilege('anon', 'public.get_mobile_customer_onboarding()', 'execute') then
    raise exception 'Anonymous RPC execution is enabled';
  end if;
  if not has_function_privilege('authenticated', 'public.get_mobile_customer_onboarding()', 'execute') then
    raise exception 'Authenticated RPC execution is missing';
  end if;
  foreach scenario in array array['manual', 'already-toured', 'optional-username', 'unverified', 'old', 'ordered', 'google'] loop
    u := gen_random_uuid();
    insert into auth.users(id, email, created_at, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    values (
      u, 'voucher-audit-' || u::text || '@example.invalid',
      case when scenario='old' then now()-interval '31 days' else now() end,
      case when scenario='unverified' then null else now() end,
      jsonb_build_object('provider', case when scenario='google' then 'google' else 'email' end),
      jsonb_build_object('full_name', 'Voucher Audit', 'username', case when scenario in ('google','optional-username') then '' else 'qa_'||substr(replace(u::text,'-',''),1,16) end, 'cozy_tour_completed_v1', scenario='already-toured')
    );
    if scenario='google' then
      insert into auth.identities(user_id, provider_id, provider, identity_data)
      values (u,u::text,'google',jsonb_build_object('sub',u::text));
    end if;
    if scenario='ordered' then
      insert into public.orders(user_id,order_number,payment_method,subtotal,total,shipping_address)
      values(u,'QA-'||u::text,'cod',5000,5000,'{}');
    end if;
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    one := public.get_mobile_customer_onboarding();
    if scenario='google' then
      if not (one->>'needsUsername')::boolean or (one->>'showVoucher')::boolean then
        raise exception 'Google setup no longer gates reward issuance';
      end if;
      one := public.complete_mobile_google_onboarding('qa_'||substr(replace(u::text,'-',''),1,16));
    end if;
    if scenario in ('unverified','old','ordered') then
      if (one->>'showVoucher')::boolean or exists(select 1 from public.mobile_loyalty_redemptions where user_id=u) then
        raise exception 'Ineligible scenario % received reward',scenario;
      end if;
      continue;
    end if;
    if not coalesce((one->>'showVoucher')::boolean,false) then raise exception 'Missing reward for %',scenario; end if;
    if (one->'voucher'->>'discountAmount')::numeric<>500 or (one->'voucher'->>'minimumOrderAmount')::numeric<>5000 then
      raise exception 'Wrong reward terms';
    end if;
    reward := (one->'voucher'->>'id')::uuid;
    expiry := (one->'voucher'->>'expiresAt')::timestamptz;
    two := public.get_mobile_customer_onboarding();
    if one->'voucher' is distinct from two->'voucher' then raise exception 'Retry changed reward for %',scenario; end if;
    if (select count(*) from public.mobile_loyalty_redemptions where user_id=u and reward_source='welcome')<>1 then
      raise exception 'Expected exactly one reward';
    end if;
    one := public.acknowledge_mobile_welcome_voucher();
    two := public.get_mobile_customer_onboarding();
    if (one->>'showVoucher')::boolean or (two->>'showVoucher')::boolean then raise exception 'Dismissed reward reopened'; end if;
    if not exists(select 1 from public.mobile_loyalty_redemptions where id=reward and status='available' and expires_at=expiry) then
      raise exception 'Dismissing consumed or changed reward';
    end if;
    update public.mobile_loyalty_redemptions set status='applied', used_at=now() where id=reward;
    perform public.get_mobile_customer_onboarding();
    if (select count(*) from public.mobile_loyalty_redemptions where user_id=u and reward_source='welcome')<>1 then
      raise exception 'Applied reward replaced';
    end if;
    update public.mobile_loyalty_redemptions set status='available', expires_at=now()-interval '1 day' where id=reward;
    update public.mobile_google_onboarding set voucher_seen_at=null where user_id=u;
    two := public.get_mobile_customer_onboarding();
    if (two->>'showVoucher')::boolean then raise exception 'Expired reward appeared'; end if;
  end loop;
  -- Check denial for an existing non-customer without editing team access.
  select id into u from public.profiles where role::text <> 'customer' limit 1;
  if u is null then raise exception 'Missing non-customer permission test fixture'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  denied:=false;
  begin perform public.get_mobile_customer_onboarding();
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Non-customer received onboarding reward access'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  denied:=false;
  begin perform public.get_mobile_customer_onboarding();
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Missing identity accepted'; end if;
end $test$;
rollback;
select 'PASS: manual, already toured, optional username, Google compatibility, unverified/old/ordered/admin/anonymous denial, exact reward terms, repeat calls, dismissal, used and expired reward; all fixtures rolled back' as result;

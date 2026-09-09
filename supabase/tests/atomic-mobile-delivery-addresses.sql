-- Run after the migration, in a transaction that is ALWAYS rolled back.
-- Reserved synthetic users only; no signup API, emails or orders are invoked.
begin;
do $test$
declare
  customer uuid := gen_random_uuid();
  other_customer uuid := gen_random_uuid();
  first_address public.addresses;
  second_address public.addresses;
  payload jsonb := '{"recipient_name":"QA Address","mobile":"09171234567","email":"qa@example.invalid","address_line":"QA only","barangay":"Bagong Pag-asa","city":"Quezon City","province":"Metro Manila","postal_code":"1105","is_primary":true}';
  denied boolean;
begin
  if has_function_privilege('anon','public.save_mobile_delivery_address(jsonb,boolean,uuid)','execute') then raise exception 'Anonymous access enabled'; end if;
  insert into auth.users(id,email,created_at,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  select id,'address-audit-'||id::text||'@example.invalid',now(),now(),'{"provider":"email"}',jsonb_build_object('full_name','Address Audit','username','qa_'||substr(replace(id::text,'-',''),1,16))
  from unnest(array[customer,other_customer]) as fixture(id);
  perform set_config('request.jwt.claim.sub',customer::text,true);
  denied := false;
  begin perform public.save_mobile_delivery_address(payload, false, other_customer);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Changed account accepted an old draft'; end if;
  first_address := public.save_mobile_delivery_address(payload);
  second_address := public.save_mobile_delivery_address(payload || '{"label":"Work"}');
  if (select count(*) from public.addresses where user_id=customer and is_primary) <> 1 then raise exception 'Multiple defaults'; end if;
  if not second_address.is_primary or first_address.id=second_address.id then raise exception 'Save failed'; end if;
  perform public.save_mobile_delivery_address(jsonb_build_object('id',first_address.id),true);
  if not (select is_primary from public.addresses where id=first_address.id) then raise exception 'Default switch failed'; end if;

  denied := false;
  begin
    perform public.save_mobile_delivery_address(payload || '{"recipient_name":""}');
  exception when invalid_parameter_value then denied := true; end;
  if not denied or not (select is_primary from public.addresses where id=first_address.id) then raise exception 'Failed save removed existing default'; end if;
  denied := false;
  begin
    perform public.save_mobile_delivery_address(jsonb_build_object('id',gen_random_uuid()),true);
  exception when no_data_found then denied := true; end;
  if not denied or not (select is_primary from public.addresses where id=first_address.id) then raise exception 'Missing target removed existing default'; end if;

  -- The incoming user_id field must never choose an address owner.
  second_address := public.save_mobile_delivery_address(payload || jsonb_build_object('id',second_address.id,'user_id',other_customer,'recipient_name','QA Edited','is_primary',false));
  if second_address.user_id<>customer or second_address.recipient_name<>'QA Edited' then raise exception 'Owner/recipient mismatch'; end if;
  perform set_config('request.jwt.claim.sub',other_customer::text,true);
  denied := false;
  begin
    perform public.save_mobile_delivery_address(jsonb_build_object('id',first_address.id),true);
  exception when no_data_found then denied := true; end;
  if not denied then raise exception 'Cross-account update accepted'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  denied := false;
  begin perform public.save_mobile_delivery_address(payload);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Missing identity accepted'; end if;
end $test$;
select 'PASS: atomic default changes, rejected save retains default, exact returned address, owner isolation and anonymous denial' as result;
rollback;

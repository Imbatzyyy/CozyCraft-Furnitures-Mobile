-- The legacy client cleared the default in one request and saved the
-- replacement in another. A rejected save could leave no default address.
-- All address changes in this RPC either succeed together or roll back.
create or replace function public.save_mobile_delivery_address(
  p_address jsonb,
  p_primary_only boolean default false,
  p_expected_user_id uuid default null
) returns public.addresses
language plpgsql security definer set search_path = public
as $function$
declare
  customer_id uuid := auth.uid();
  address_id uuid := nullif(p_address->>'id', '')::uuid;
  saved public.addresses;
  field text;
  make_primary boolean := coalesce(p_primary_only, false) or coalesce((p_address->>'is_primary')::boolean, false);
begin
  if customer_id is null then raise exception 'Sign in to save a delivery address.' using errcode = '42501'; end if;
  if p_expected_user_id is not null and p_expected_user_id <> customer_id then
    raise exception 'The signed-in account changed. Reopen your delivery addresses.' using errcode = '42501';
  end if;
  -- Serialize this customer's default changes, including concurrent creates.
  perform 1 from public.profiles where id = customer_id and role::text = 'customer' for update;
  if not found then raise exception 'Customer account required.' using errcode = '42501'; end if;
  if jsonb_typeof(p_address) is distinct from 'object' then raise exception 'Invalid address.' using errcode = '22023'; end if;

  if address_id is not null then
    select * into saved from public.addresses where id = address_id and user_id = customer_id for update;
    if not found then raise exception 'Delivery address not found.' using errcode = 'P0002'; end if;
  elsif p_primary_only then
    raise exception 'Choose a saved delivery address.' using errcode = '22023';
  end if;

  if not coalesce(p_primary_only, false) then
    foreach field in array array['recipient_name','mobile','address_line','barangay','city','province','postal_code'] loop
      if nullif(btrim(p_address->>field), '') is null then raise exception 'Complete the delivery address: %.', field using errcode = '22023'; end if;
    end loop;
  end if;
  if make_primary then
    update public.addresses set is_primary = false, updated_at = now()
    where user_id = customer_id and is_primary and id is distinct from address_id;
  end if;
  if p_primary_only then
    update public.addresses set is_primary = true, updated_at = now()
    where id = address_id and user_id = customer_id returning * into saved;
  elsif address_id is not null then
    update public.addresses set
      label = coalesce(nullif(btrim(p_address->>'label'), ''), 'Home'),
      recipient_name = btrim(p_address->>'recipient_name'), mobile = btrim(p_address->>'mobile'),
      email = coalesce(btrim(p_address->>'email'), ''), address_line = btrim(p_address->>'address_line'),
      barangay = btrim(p_address->>'barangay'), city = btrim(p_address->>'city'),
      province = btrim(p_address->>'province'), postal_code = btrim(p_address->>'postal_code'),
      delivery_note = coalesce(p_address->>'delivery_note', ''), is_primary = make_primary, updated_at = now()
    where id = address_id and user_id = customer_id returning * into saved;
  else
    insert into public.addresses(user_id,label,recipient_name,mobile,email,address_line,barangay,city,province,postal_code,delivery_note,is_primary)
    values(customer_id,coalesce(nullif(btrim(p_address->>'label'), ''),'Home'),btrim(p_address->>'recipient_name'),btrim(p_address->>'mobile'),coalesce(btrim(p_address->>'email'),''),btrim(p_address->>'address_line'),btrim(p_address->>'barangay'),btrim(p_address->>'city'),btrim(p_address->>'province'),btrim(p_address->>'postal_code'),coalesce(p_address->>'delivery_note',''),make_primary)
    returning * into saved;
  end if;
  return saved;
end
$function$;
revoke all on function public.save_mobile_delivery_address(jsonb, boolean, uuid) from public, anon;
grant execute on function public.save_mobile_delivery_address(jsonb, boolean, uuid) to authenticated;
comment on function public.save_mobile_delivery_address(jsonb, boolean, uuid) is
  'Customer-owned atomic delivery address save/default change. The server derives ownership from auth.uid().';

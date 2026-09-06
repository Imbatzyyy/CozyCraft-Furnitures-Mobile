-- Mobile-only endpoint. Website checkout remains unchanged.
create table if not exists private.mobile_cod_checkout_intents (
  user_id uuid not null references auth.users(id) on delete cascade,
  checkout_key uuid not null,
  intent jsonb not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, checkout_key)
);
alter table private.mobile_cod_checkout_intents enable row level security;
revoke all on private.mobile_cod_checkout_intents from public, anon, authenticated;
create index if not exists mobile_cod_checkout_intents_order_idx on private.mobile_cod_checkout_intents(order_id);

create or replace function private.place_mobile_cod_order(
  p_address_id uuid, p_items jsonb, p_checkout_key uuid, p_redemption_id uuid default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_intent jsonb := jsonb_build_object('address', p_address_id, 'items', p_items, 'reward', p_redemption_id);
  v_existing private.mobile_cod_checkout_intents;
  v_id uuid;
  v_order public.orders;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_checkout_key is null then raise exception 'A checkout key is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_checkout_key::text, 0));
  select * into v_existing from private.mobile_cod_checkout_intents
    where user_id = v_user and checkout_key = p_checkout_key;
  if found then
    if v_existing.intent <> v_intent then raise exception 'This checkout key belongs to a different order'; end if;
    if v_existing.order_id is null then raise exception 'This checkout is no longer available'; end if;
    v_id := v_existing.order_id;
  else
    v_id := public.place_order(p_address_id, 'cod', p_items, p_checkout_key);
    if p_redemption_id is not null then
      perform public.apply_mobile_reward_to_order(v_id, p_redemption_id);
    end if;
    perform public.mark_mobile_order(v_id);
    insert into private.mobile_cod_checkout_intents(user_id, checkout_key, intent, order_id)
      values (v_user, p_checkout_key, v_intent, v_id);
  end if;
  select * into strict v_order from public.orders where id = v_id and user_id = v_user;
  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number,
    'total', v_order.total, 'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
    'reward_discount', v_order.reward_discount, 'created_at', v_order.created_at);
end;
$$;
revoke all on function private.place_mobile_cod_order(uuid,jsonb,uuid,uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.place_mobile_cod_order(uuid,jsonb,uuid,uuid) to authenticated;

create or replace function public.place_mobile_cod_order(
  p_address_id uuid, p_items jsonb, p_checkout_key uuid, p_redemption_id uuid default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.place_mobile_cod_order(p_address_id, p_items, p_checkout_key, p_redemption_id); $$;
revoke all on function public.place_mobile_cod_order(uuid,jsonb,uuid,uuid) from public, anon;
grant execute on function public.place_mobile_cod_order(uuid,jsonb,uuid,uuid) to authenticated;

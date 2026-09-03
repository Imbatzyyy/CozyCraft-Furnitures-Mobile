-- Complete the remaining customer-mobile checklist without introducing new
-- polling. Realtime continues to observe the existing tables; these triggers
-- only create durable notification rows when an actual business event occurs.

-- Promotional communication must always be explicit opt-in for new records.
-- Existing customer choices are intentionally preserved.
alter table public.customer_preferences
  alter column home_circle_notes set default false;

-- A single authenticated transaction moves a saved piece into the bag. This
-- replaces a delete + upsert round trip, keeps RLS in force (security invoker),
-- and prevents two fast taps from incrementing the bag twice.
create or replace function public.move_wishlist_item_to_cart(p_product_id text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_stock integer;
  v_status text;
  v_quantity integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to move a saved piece.';
  end if;

  if nullif(trim(p_product_id), '') is null then
    raise exception 'A product is required.';
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_product_id, 0)
  );

  if not exists (
    select 1
    from public.wishlist_items
    where user_id = v_user_id
      and product_id = p_product_id
  ) then
    raise exception 'This piece is no longer in your saved list.';
  end if;

  select stock_quantity, status::text
    into v_stock, v_status
  from public.products
  where id = p_product_id;

  if not found or v_status <> 'active' then
    raise exception 'This piece is not currently available.';
  end if;
  if coalesce(v_stock, 0) <= 0 then
    raise exception 'This piece is currently out of stock.';
  end if;

  insert into public.cart_items (
    user_id,
    product_id,
    quantity,
    selected_for_checkout,
    updated_at
  ) values (
    v_user_id,
    p_product_id,
    1,
    true,
    now()
  )
  on conflict (user_id, product_id) do update
    set quantity = least(public.cart_items.quantity + 1, v_stock),
        selected_for_checkout = true,
        updated_at = now()
  returning quantity into v_quantity;

  delete from public.wishlist_items
  where user_id = v_user_id
    and product_id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'quantity', v_quantity
  );
end;
$$;

revoke all on function public.move_wishlist_item_to_cart(text) from public, anon;
grant execute on function public.move_wishlist_item_to_cart(text) to authenticated;

comment on function public.move_wishlist_item_to_cart(text) is
  'Atomically moves the signed-in customer''s saved product into their selected cart.';

-- Only event types that must have exactly one durable notification per entity
-- are covered. Order-status history remains intentionally repeatable.
create unique index if not exists customer_notifications_mobile_event_once_idx
  on public.customer_notifications (user_id, kind, entity_type, entity_id)
  where kind in ('order_confirmation', 'promotion');

create or replace function private.notify_customer_order_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.customer_notifications (
    user_id,
    kind,
    title,
    message,
    entity_type,
    entity_id
  ) values (
    new.user_id,
    'order_confirmation',
    'Order confirmed',
    case
      when new.payment_method in ('card', 'gcash') and new.payment_status = 'paid'
        then format('Payment received. Order %s is confirmed and ready for preparation.', new.order_number)
      when new.payment_method = 'cod'
        then format('Order %s is placed. Payment will be collected on delivery.', new.order_number)
      else format('Order %s is confirmed. Follow every update in My Orders.', new.order_number)
    end,
    'orders',
    new.id::text
  )
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.notify_customer_order_confirmation() from public;

drop trigger if exists notify_customer_order_confirmation on public.orders;
create trigger notify_customer_order_confirmation
after insert on public.orders
for each row execute function private.notify_customer_order_confirmation();

-- The admin already manages a single store announcement. Turning on a new or
-- changed announcement now creates one promotional notification for customers
-- who explicitly enabled Home Circle notes. No scheduled scan is required.
create or replace function private.notify_customer_store_announcement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entity_id text;
begin
  if new.announcement_enabled is not true
     or nullif(trim(new.announcement_text), '') is null then
    return new;
  end if;

  if old.announcement_enabled is true
     and old.announcement_text is not distinct from new.announcement_text
     and old.announcement_link is not distinct from new.announcement_link then
    return new;
  end if;

  v_entity_id := 'announcement:' || md5(
    trim(new.announcement_text) || '|' || coalesce(trim(new.announcement_link), '')
  );

  insert into public.customer_notifications (
    user_id,
    kind,
    title,
    message,
    entity_type,
    entity_id
  )
  select
    preferences.user_id,
    'promotion',
    'A new CozyCraft edit is here',
    trim(new.announcement_text),
    'store_announcement',
    v_entity_id
  from public.customer_preferences preferences
  where preferences.home_circle_notes is true
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.notify_customer_store_announcement() from public;

drop trigger if exists notify_customer_store_announcement on public.store_settings;
create trigger notify_customer_store_announcement
after update of announcement_enabled, announcement_text, announcement_link
on public.store_settings
for each row execute function private.notify_customer_store_announcement();

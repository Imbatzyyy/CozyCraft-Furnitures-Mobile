-- COD orders are confirmed when placed. Card and GCash reservations are only
-- confirmed after PayMongo has atomically changed payment_status to paid.
-- The partial unique index from the preceding migration keeps this idempotent
-- across webhook retries and manual reconciliation.
create or replace function private.notify_customer_order_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.payment_method = 'cod' then
    if tg_op <> 'INSERT' then
      return new;
    end if;
  elsif new.payment_method in ('card', 'gcash') then
    if new.payment_status <> 'paid' then
      return new;
    end if;
    if tg_op = 'UPDATE' then
      if old.payment_status = 'paid' then
        return new;
      end if;
    end if;
  else
    return new;
  end if;

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
      when new.payment_method = 'cod'
        then format('Order %s is placed. Payment will be collected on delivery.', new.order_number)
      else format('Payment received. Order %s is confirmed and ready for preparation.', new.order_number)
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
after insert or update of payment_status on public.orders
for each row execute function private.notify_customer_order_confirmation();

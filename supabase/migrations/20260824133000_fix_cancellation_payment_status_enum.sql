-- Keep cancellation approval atomic while assigning the database enum with
-- its native type. The previous text variable compiled into the stored
-- function but failed when the approval path updated orders.payment_status.
create or replace function public.finalize_admin_order_cancellation(
  p_order_id uuid,
  p_reviewer uuid,
  p_reason text,
  p_claim_token uuid,
  p_note text default null,
  p_refund_id text default null,
  p_demo boolean default false,
  p_raw_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order public.orders%rowtype;
  v_transaction public.payment_transactions%rowtype;
  v_was_cancelled boolean;
  v_requires_refund boolean;
  v_refund_id text;
  v_now timestamptz := clock_timestamp();
  v_payment_status public.payment_status;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('shipped', 'delivered') then
    raise exception 'This order has already shipped and requires the return workflow';
  end if;

  select * into v_transaction
  from public.payment_transactions
  where order_id = v_order.id
  for update;

  v_was_cancelled := v_order.status = 'cancelled';
  v_refund_id := coalesce(nullif(btrim(coalesce(p_refund_id, '')), ''), v_order.provider_refund_id);
  v_requires_refund := v_order.payment_method <> 'cod'
    and (v_order.payment_status in ('paid', 'refunded') or v_refund_id is not null);

  if v_requires_refund and v_order.cancellation_claim_token is distinct from p_claim_token then
    raise exception using errcode = '40001', message = 'This cancellation claim is no longer owned by this request';
  end if;
  if v_requires_refund and v_refund_id is null then
    raise exception 'Provider refund reference is required';
  end if;
  if v_requires_refund and v_transaction.id is null then
    raise exception 'Related payment transaction not found';
  end if;
  if v_order.payment_method = 'cod' and v_order.payment_status = 'paid' then
    raise exception 'A settled cash-on-delivery order requires manual financial review';
  end if;

  v_payment_status := case
    when v_requires_refund then 'refunded'::public.payment_status
    when v_order.payment_status = 'pending' then 'failed'::public.payment_status
    else v_order.payment_status
  end;

  update public.orders
  set cancellation_reason = btrim(p_reason),
      cancellation_requested_at = coalesce(cancellation_requested_at, v_now),
      cancellation_status = 'approved',
      cancellation_reviewed_at = v_now,
      cancellation_reviewed_by = p_reviewer,
      cancellation_decision_note = nullif(btrim(coalesce(p_note, '')), ''),
      cancelled_by = p_reviewer,
      status = 'cancelled',
      payment_status = v_payment_status,
      refund_status = case when v_requires_refund then case when p_demo then 'demo_succeeded' else 'succeeded' end else refund_status end,
      provider_refund_id = case when v_requires_refund then v_refund_id else provider_refund_id end,
      refunded_at = case when v_requires_refund then coalesce(refunded_at, v_now) else refunded_at end,
      cancellation_claim_token = null,
      cancellation_claimed_at = null
  where id = v_order.id;

  if v_transaction.id is not null then
    update public.payment_transactions
    set status = case when v_requires_refund then 'refunded' when status = 'pending' then 'failed' else status end,
        raw_payload = case when v_requires_refund then coalesce(raw_payload, '{}'::jsonb) || coalesce(p_raw_payload, '{}'::jsonb) else raw_payload end,
        failure_reason = case when not v_requires_refund and status = 'pending' then 'Order cancelled before settlement' else failure_reason end,
        updated_at = v_now
    where id = v_transaction.id;
  end if;

  if not v_was_cancelled then
    insert into public.customer_notifications(user_id, kind, title, message, entity_type, entity_id)
    values(
      v_order.user_id,
      case when v_requires_refund then 'refund_completed' else 'order_cancelled' end,
      case when v_requires_refund then format('Refund recorded for %s', v_order.order_number) else format('Order %s cancelled', v_order.order_number) end,
      case when v_requires_refund then case when p_demo then 'Your test payment refund was completed for this demo order.' else 'Your refund was submitted to the original payment method.' end else 'Your order was cancelled before payment settlement. No refund is required.' end,
      'orders',
      v_order.id::text
    );
  end if;

  return jsonb_build_object(
    'orderId', v_order.id,
    'cancelled', true,
    'reused', v_was_cancelled,
    'requiresRefund', v_requires_refund,
    'refundId', v_refund_id
  );
end;
$$;

revoke all on function public.finalize_admin_order_cancellation(uuid, uuid, text, uuid, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_admin_order_cancellation(uuid, uuid, text, uuid, text, text, boolean, jsonb) to service_role;

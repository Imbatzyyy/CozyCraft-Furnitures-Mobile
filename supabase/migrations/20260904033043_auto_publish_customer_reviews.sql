-- Verified customer reviews publish immediately. The `approved` column remains
-- the storefront visibility switch so staff can hide policy-violating content
-- after publication without putting ordinary reviews into an approval queue.

alter table public.reviews
  alter column approved set default true;

comment on column public.reviews.approved is
  'Storefront visibility. New verified reviews are visible immediately; staff may hide content after publication.';

alter table public.store_settings
  alter column review_settings set default
    '{"verified_purchases_only":true,"minimum_length":5,"maximum_length":2000,"photos_enabled":false}'::jsonb;

update public.store_settings
set review_settings = review_settings - 'approval_required'
where review_settings ? 'approval_required';

-- Release reviews held by the retired pre-publication approval workflow.
update public.reviews
set approved = true
where not approved;

drop policy if exists reviews_customer_insert_delivered_purchase on public.reviews;
create policy reviews_customer_insert_delivered_purchase
on public.reviews
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and approved
  and exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = reviews.order_item_id
      and oi.product_id = reviews.product_id
      and o.user_id = (select auth.uid())
      and o.status = 'delivered'
  )
);

create or replace function public.submit_order_item_review(
  p_order_item_id bigint,
  p_rating integer,
  p_title text,
  p_body text,
  p_image_urls text[] default '{}'
)
returns table (
  id uuid,
  rating integer,
  body text,
  image_urls text[],
  approved boolean,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_product_id text;
  v_order_status text;
  v_existing public.reviews%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to review a purchase.';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  if length(trim(coalesce(p_body, ''))) < 5 then
    raise exception 'Review must contain at least 5 characters.';
  end if;

  if coalesce(array_length(p_image_urls, 1), 0) > 2 then
    raise exception 'A review can contain at most 2 photos.';
  end if;

  select oi.product_id, o.status
  into v_product_id, v_order_status
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
    and o.user_id = v_user_id;

  if v_product_id is null then
    raise exception 'This purchase could not be found.';
  end if;

  if v_order_status <> 'delivered' then
    raise exception 'Only delivered purchases can be reviewed.';
  end if;

  select r.*
  into v_existing
  from public.reviews r
  where r.order_item_id = p_order_item_id;

  if found then
    return query
    select v_existing.id, v_existing.rating, v_existing.body,
      v_existing.image_urls, v_existing.approved, v_existing.created_at;
    return;
  end if;

  return query
  insert into public.reviews (
    user_id,
    product_id,
    order_item_id,
    rating,
    title,
    body,
    image_urls,
    approved
  )
  values (
    v_user_id,
    v_product_id,
    p_order_item_id,
    p_rating,
    left(trim(coalesce(p_title, '')), 120),
    trim(p_body),
    coalesce(p_image_urls, '{}'),
    true
  )
  returning reviews.id, reviews.rating, reviews.body, reviews.image_urls,
    reviews.approved, reviews.created_at;
end;
$$;

revoke all on function public.submit_order_item_review(bigint, integer, text, text, text[]) from public;
grant execute on function public.submit_order_item_review(bigint, integer, text, text, text[]) to authenticated;

create or replace function private.submit_product_review(
  p_product_id text,
  p_rating integer,
  p_title text,
  p_body text
)
returns table (id uuid, approved boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_review public.reviews%rowtype;
  v_order_item_id bigint;
  v_settings jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to review a product.';
  end if;

  select s.review_settings
  into v_settings
  from public.store_settings s
  where s.id = true;

  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  if length(trim(coalesce(p_body, ''))) < coalesce((v_settings->>'minimum_length')::integer, 5) then
    raise exception 'Your review is too short.';
  end if;

  if length(trim(coalesce(p_body, ''))) > coalesce((v_settings->>'maximum_length')::integer, 2000)
     or length(trim(coalesce(p_title, ''))) > 120 then
    raise exception 'The review is too long.';
  end if;

  select oi.id
  into v_order_item_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.reviews existing on existing.order_item_id = oi.id
  where o.user_id = v_user_id
    and o.status = 'delivered'
    and oi.product_id = p_product_id
    and existing.id is null
  order by o.created_at desc, oi.id desc
  limit 1;

  if v_order_item_id is null then
    select r.*
    into v_review
    from public.reviews r
    where r.user_id = v_user_id
      and r.product_id = p_product_id
    order by r.created_at desc
    limit 1;

    if not found then
      raise exception 'Only delivered purchases can be reviewed.';
    end if;
  end if;

  if v_order_item_id is not null then
    insert into public.reviews (
      user_id,
      product_id,
      order_item_id,
      rating,
      title,
      body,
      approved
    )
    values (
      v_user_id,
      p_product_id,
      v_order_item_id,
      p_rating,
      trim(coalesce(p_title, '')),
      trim(p_body),
      true
    )
    returning reviews.* into v_review;
  else
    update public.reviews
    set rating = p_rating,
        title = trim(coalesce(p_title, '')),
        body = trim(p_body),
        updated_at = now()
    where reviews.id = v_review.id
    returning reviews.* into v_review;
  end if;

  return query select v_review.id, v_review.approved;
end;
$function$;

revoke all on function private.submit_product_review(text, integer, text, text)
  from public, anon, authenticated;
grant execute on function private.submit_product_review(text, integer, text, text)
  to authenticated;

-- Review notifications remain useful for oversight, but must not imply that a
-- public review is waiting for approval.
create or replace function private.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product_name text;
begin
  select name into v_product_name
  from public.products
  where id = new.product_id;

  insert into public.admin_notifications (
    kind, title, message, entity_type, entity_id, route
  ) values (
    'review',
    'New customer review published',
    format(
      'A verified %s-star review for %s is now visible on the storefront.',
      new.rating,
      coalesce(v_product_name, new.product_id)
    ),
    'reviews',
    new.id::text,
    '/admin/reviews'
  );
  return new;
end;
$$;

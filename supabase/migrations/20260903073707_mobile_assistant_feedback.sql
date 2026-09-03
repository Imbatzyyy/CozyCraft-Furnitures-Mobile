-- One compact feedback row per rated assistant answer. Message text is never
-- retained here: product and customer conversations can contain private order
-- details, while aggregate helpfulness and response kind are sufficient for
-- improving CozyCraft Care.
create table if not exists public.mobile_assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  response_id text not null check (char_length(response_id) between 8 and 100),
  helpful boolean not null,
  response_kind text not null default 'general'
    check (response_kind in ('general', 'directions', 'order', 'product')),
  client text not null default 'mobile' check (client = 'mobile'),
  created_at timestamptz not null default now(),
  unique (user_id, response_id)
);

alter table public.mobile_assistant_feedback enable row level security;

revoke all on table public.mobile_assistant_feedback from public, anon;
grant insert on table public.mobile_assistant_feedback to authenticated;

drop policy if exists "Customers can rate their own mobile assistant replies"
  on public.mobile_assistant_feedback;
create policy "Customers can rate their own mobile assistant replies"
on public.mobile_assistant_feedback
for insert
to authenticated
with check ((select auth.uid()) = user_id and client = 'mobile');

create index if not exists mobile_assistant_feedback_created_idx
  on public.mobile_assistant_feedback (created_at desc);

comment on table public.mobile_assistant_feedback is
  'Privacy-minimized one-time helpfulness ratings for signed-in mobile CozyCraft Care sessions.';

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null references public.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_self on public.push_subscriptions
  for select using (user_id = app.current_uid());

create policy push_subscriptions_insert_self on public.push_subscriptions
  for insert with check (user_id = app.current_uid());

create policy push_subscriptions_update_self on public.push_subscriptions
  for update using (user_id = app.current_uid())
  with check (user_id = app.current_uid());

create policy push_subscriptions_delete_self on public.push_subscriptions
  for delete using (user_id = app.current_uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;;

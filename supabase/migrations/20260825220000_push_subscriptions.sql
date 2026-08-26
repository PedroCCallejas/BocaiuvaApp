-- Inscrições de Web Push, uma por navegador.
--
-- Não reaproveita `users.notification_tokens`, e não é descuido: token do Expo é
-- uma string opaca; inscrição de Web Push é um trio (endpoint + p256dh + auth)
-- que o servidor usa para **criptografar** o payload. Formatos diferentes,
-- ciclos de vida diferentes.
--
-- A chave é o `endpoint` porque é ele que identifica a inscrição para o
-- navegador. A mesma pessoa tem uma linha por aparelho — celular e desktop são
-- duas — e o navegador troca o endpoint sozinho quando quer, deixando o antigo
-- morto. Por isso a limpeza acontece na resposta do envio: endpoint que responde
-- 404 ou 410 é apagado, não é erro.
--
-- `user_agent` é só para depurar "por que fulano não recebeu": sem ele, uma
-- linha morta é indistinguível de uma viva.

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

-- Cada conta enxerga e mexe só nas próprias inscrições.
--
-- Ninguém precisa ler a inscrição de outra pessoa: quem envia é a Edge Function,
-- com service role, que passa por cima da RLS. Deixar um membro ler a inscrição
-- do outro só serviria para vazar de qual aparelho cada um usa o app.
create policy push_subscriptions_select_self on public.push_subscriptions
  for select using (user_id = app.current_uid());

create policy push_subscriptions_insert_self on public.push_subscriptions
  for insert with check (user_id = app.current_uid());

create policy push_subscriptions_update_self on public.push_subscriptions
  for update using (user_id = app.current_uid())
  with check (user_id = app.current_uid());

create policy push_subscriptions_delete_self on public.push_subscriptions
  for delete using (user_id = app.current_uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

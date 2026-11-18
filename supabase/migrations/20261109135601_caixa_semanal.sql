-- PREPARADA: não aplicada em produção. Caixa separado de despesas/rateios.
begin;
create table public.team_cash_entries (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  amount_cents integer not null check (amount_cents > 0),
  description text check (description is null or char_length(description) <= 240),
  created_at timestamptz not null default now(),
  unique (team_id, week_start)
);
alter table public.team_cash_entries enable row level security;
revoke all on public.team_cash_entries from public, anon, authenticated, service_role;
grant select, insert, update on public.team_cash_entries to authenticated;
create policy team_cash_read on public.team_cash_entries for select to authenticated
  using (app.is_team_member(team_id) or app.can_manage_team(team_id));
create policy team_cash_insert on public.team_cash_entries for insert to authenticated
  with check (app.can_manage_team(team_id));
create policy team_cash_update on public.team_cash_entries for update to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));
comment on table public.team_cash_entries is
  'Arrecadação semanal informada pelo administrador; não deduz despesas nem controla pagamentos individuais.';
-- A leitura explícita distingue caixa vazio de sessão/vínculo sem acesso.
create function public.listar_caixa_do_time(p_team_id text)
returns setof public.team_cash_entries
language plpgsql stable security invoker
set search_path = public, app, pg_temp
as $cash$
begin
  if not (app.is_team_member(p_team_id) or app.can_manage_team(p_team_id)) then
    raise exception 'Sem acesso ao caixa deste time' using errcode = '42501';
  end if;
  return query select * from public.team_cash_entries where team_id = p_team_id;
end;
$cash$;
revoke all on function public.listar_caixa_do_time(text) from public, anon;
grant execute on function public.listar_caixa_do_time(text) to authenticated;
commit;

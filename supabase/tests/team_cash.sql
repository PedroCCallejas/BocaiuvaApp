-- Fixtures fictícias; executado apenas no PostgreSQL descartável.
begin;
insert into public.users(id, email, display_name) values
  ('cash-owner', 'cash-owner@example.invalid', 'Owner'),
  ('cash-member', 'cash-member@example.invalid', 'Member'),
  ('cash-other', 'cash-other@example.invalid', 'Other');
insert into public.teams(id, name, slug, primary_color, secondary_color, invite_code, admin_user_id) values
  ('cash-a', 'Cash A', 'cash-a', '#000000', '#ffffff', 'CASHAA', 'cash-owner'),
  ('cash-b', 'Cash B', 'cash-b', '#000000', '#ffffff', 'CASHBB', 'cash-other');
insert into public.team_members(id, team_id, user_id, roles, can_manage_team, can_manage_players, status) values
  ('cash-membership', 'cash-a', 'cash-member', array['player'], false, false, 'active');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cash-owner","role":"authenticated"}', true);
insert into public.team_cash_entries(team_id, week_start, amount_cents) values ('cash-a', '2026-11-09', 15000);
update public.team_cash_entries set amount_cents = 17500 where team_id = 'cash-a';
do $$ begin
  if (select sum(amount_cents) from public.listar_caixa_do_time('cash-a')) <> 17500 then
    raise exception 'Administrador não conseguiu corrigir o caixa'; end if;
  begin
    insert into public.team_cash_entries(team_id, week_start, amount_cents) values ('cash-a', '2026-11-09', 15000);
    raise exception 'Semana duplicada permitida';
  exception when unique_violation then null; end;
  begin
    insert into public.team_cash_entries(team_id, week_start, amount_cents) values ('cash-b', '2026-11-09', 15000);
    raise exception 'Escrita entre times permitida';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"cash-member","role":"authenticated"}', true);
do $$ declare changed integer; begin
  if (select sum(amount_cents) from public.team_cash_entries where team_id = 'cash-a') <> 17500 then
    raise exception 'Membro não consegue ler caixa'; end if;
  update public.team_cash_entries set amount_cents = 1 where team_id = 'cash-a';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Membro alterou caixa'; end if;
  begin
    insert into public.team_cash_entries(team_id, week_start, amount_cents) values ('cash-a', '2026-11-16', 15000);
    raise exception 'Membro registrou caixa';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"cash-other","role":"authenticated"}', true);
do $$ begin
  if exists(select 1 from public.team_cash_entries where team_id = 'cash-a') then
    raise exception 'Outro time leu caixa'; end if;
  begin
    perform * from public.listar_caixa_do_time('cash-a');
    raise exception 'RPC confundiu falta de acesso com caixa vazio';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.team_members set status = 'inactive' where id = 'cash-membership';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cash-member","role":"authenticated"}', true);
do $$ begin
  if exists(select 1 from public.team_cash_entries where team_id = 'cash-a') then
    raise exception 'Membro inativo leu caixa'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  begin
    perform * from public.team_cash_entries;
    raise exception 'Anônimo leu caixa';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

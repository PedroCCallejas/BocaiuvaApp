-- Somente em banco local reconstruído. Todos os registros são fictícios.
begin;

insert into public.users(id, email, display_name, app_role) values
  ('qa-owner-a', 'owner-a@example.invalid', 'Owner A', 'team_admin'),
  ('qa-owner-b', 'owner-b@example.invalid', 'Owner B', 'team_admin'),
  ('qa-player-a', 'player-a@example.invalid', 'Player A', 'player'),
  ('qa-outsider', 'outsider@example.invalid', 'Outsider', 'player');
insert into public.teams(id, name, slug, primary_color, secondary_color, invite_code, admin_user_id) values
  ('qa-team-a', 'QA A', 'qa-team-a', '#111111', '#ffffff', 'QAAA01', 'qa-owner-a'),
  ('qa-team-b', 'QA B', 'qa-team-b', '#111111', '#ffffff', 'QABB01', 'qa-owner-b');
insert into public.players(id, team_id, full_name, nickname, primary_position, linked_user_id) values
  ('qa-player-record-a', 'qa-team-a', 'Player A', 'A', 'midfielder', 'qa-player-a'),
  ('qa-player-record-b', 'qa-team-b', 'Player B', 'B', 'midfielder', 'qa-owner-b');
insert into public.team_members(id, team_id, user_id, player_id, roles, can_manage_team, can_manage_players, status) values
  ('qa-member-owner-a', 'qa-team-a', 'qa-owner-a', null, array['admin'], true, true, 'active'),
  ('qa-member-owner-b', 'qa-team-b', 'qa-owner-b', 'qa-player-record-b', array['admin'], true, true, 'active'),
  ('qa-member-player-a', 'qa-team-a', 'qa-player-a', 'qa-player-record-a', array['player'], false, false, 'active');
insert into public.matches(id, team_id, date, created_by, line_players_count) values
  ('qa-match-a', 'qa-team-a', '2026-10-16', 'qa-owner-a', 6),
  ('qa-match-b', 'qa-team-b', '2026-10-16', 'qa-owner-b', 6);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"qa-owner-a","email":"owner-a@example.invalid","role":"authenticated"}', true);
do $$
declare changed integer;
begin
  if (select count(*) from public.teams where id like 'qa-team-%') <> 1
    or (select count(*) from public.players where id like 'qa-player-record-%') <> 1
    or (select count(*) from public.matches where id like 'qa-match-%') <> 1
  then raise exception 'Admin A consegue ler outro time ou perdeu seu próprio time'; end if;

  update public.teams set name = 'Indevido' where id = 'qa-team-b';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Admin A alterou o time B'; end if;

  begin
    insert into public.players(id, team_id, full_name, nickname, primary_position)
    values ('qa-forbidden-player', 'qa-team-b', 'Indevido', 'Indevido', 'midfielder');
    raise exception 'Admin A criou jogador no time B';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.apurar_mvp_da_partida('qa-match-b');
    raise exception 'Admin A apurou MVP do time B';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"qa-player-a","email":"player-a@example.invalid","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.players where id like 'qa-player-record-%') <> 1 then
    raise exception 'Jogador A não recebe apenas seu elenco';
  end if;
  begin
    insert into public.matches(id, team_id, date, created_by, line_players_count)
    values ('qa-forbidden-match', 'qa-team-a', '2026-10-16', 'qa-player-a', 6);
    raise exception 'Jogador sem gestão criou partida';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"qa-outsider","email":"outsider@example.invalid","role":"authenticated"}', true);
do $$
begin
  if exists(select 1 from public.players where id like 'qa-player-record-%')
    or exists(select 1 from public.matches where id like 'qa-match-%') then
    raise exception 'Conta sem vínculo leu dados privados';
  end if;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  if exists(select 1 from public.players where id like 'qa-player-record-%') then
    raise exception 'Visitante leu elenco privado';
  end if;
end $$;

reset role;
rollback;

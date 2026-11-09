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
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"qa-owner-a","role":"authenticated"}', true);
do $$
declare path text;
begin
  if not app.can_write_media_object('team-logos', 'qa-team-a/opponents/00000000-0000-4000-8000-000000000001.png') then
    raise exception 'Admin perdeu upload do escudo adversario';
  end if;
  if not app.can_write_media_object('team-logos', 'qa-team-a/logo.jpg') then
    raise exception 'Escudo original deixou de funcionar';
  end if;
  foreach path in array array[
    'qa-team-b/opponents/00000000-0000-4000-8000-000000000001.png',
    'qa-team-a/opponents/00000000-0000-4000-8000-000000000001.jpg',
    'qa-team-a/opponents/00000000-0000-4000-8000-000000000001.svg',
    'qa-team-a/opponents/00000000-0000-4000-8000-000000000001.png/extra',
    'qa-team-a/opponents/../logo.jpg',
    'qa-team-a/opponents/not-a-uuid.png',
    'qa-team-a/../qa-team-b/opponents/00000000-0000-4000-8000-000000000001.png'
  ] loop
    if app.can_write_media_object('team-logos', path) then
      raise exception 'Caminho indevido autorizado: %', path;
    end if;
  end loop;
end $$;
select set_config('request.jwt.claims', '{"sub":"qa-player-a","role":"authenticated"}', true);
do $$ begin
  if app.can_write_media_object('team-logos', 'qa-team-a/opponents/00000000-0000-4000-8000-000000000001.png') then
    raise exception 'Jogador sem gestao pode enviar escudo';
  end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"qa-outsider","role":"authenticated"}', true);
do $$ begin
  if app.can_write_media_object('team-logos', 'qa-team-a/opponents/00000000-0000-4000-8000-000000000001.png') then
    raise exception 'Conta externa pode enviar escudo';
  end if;
end $$;
rollback;

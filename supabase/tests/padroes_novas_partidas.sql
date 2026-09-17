-- Teste transacional dos padrões do time. Nenhum dado é persistido.

begin;

insert into public.users (id, email, display_name, app_role)
values ('test-default-owner', 'default-owner@example.com', 'Owner', 'owner');

insert into public.teams (
  id,
  name,
  slug,
  primary_color,
  secondary_color,
  invite_code,
  admin_user_id,
  default_attendance_status
)
values (
  'test-default-team',
  'Time com padrões',
  'time-com-padroes',
  '#111111',
  '#ffffff',
  'PAD123',
  'test-default-owner',
  'absent'
);

insert into public.team_members (
  id,
  team_id,
  user_id,
  roles,
  can_manage_team,
  can_manage_players,
  status
)
values (
  'test-default-membership',
  'test-default-team',
  'test-default-owner',
  array['admin']::text[],
  true,
  true,
  'active'
);

insert into public.players (
  id,
  team_id,
  full_name,
  nickname,
  primary_position
)
values
  ('test-default-player-1', 'test-default-team', 'Jogador 1', 'J1', 'goalkeeper'),
  ('test-default-player-2', 'test-default-team', 'Jogador 2', 'J2', 'midfielder');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"test-default-owner","email":"default-owner@example.com","role":"authenticated"}',
  true
);

select public.criar_partida(
  jsonb_build_object(
    'id', 'test-default-match',
    'team_id', 'test-default-team',
    'date', '2026-09-24',
    'time', '20:00',
    'venue', 'La Macaibeira (AMAM)',
    'opponent_name', 'Adversário',
    'line_players_count', 6,
    'match_type', 'society',
    'status', 'scheduled',
    'created_by', 'test-default-owner'
  ),
  '["test-default-player-1","test-default-player-2"]'::jsonb
);

do $$
begin
  if (
    select count(*)
    from public.attendance
    where match_id = 'test-default-match'
      and status = 'absent'
  ) <> 2 then
    raise exception 'A nova partida não iniciou todo o elenco como ausente';
  end if;
end
$$;

reset role;
rollback;

-- Teste transacional da RPC de convite. Nenhum dado e persistido.

begin;

insert into public.users (id, email, display_name, app_role)
values
  ('test-owner', 'owner@example.com', 'Owner', 'owner'),
  ('test-player', 'player@example.com', 'Player', 'player');

insert into public.teams (
  id,
  name,
  slug,
  primary_color,
  secondary_color,
  invite_code,
  admin_user_id
)
values (
  'test-team',
  'Time de Teste',
  'time-de-teste',
  '#111111',
  '#ffffff',
  'ABC123',
  'test-owner'
);

insert into public.players (
  id,
  team_id,
  linked_email,
  full_name,
  nickname,
  primary_position
)
values (
  'test-player-record',
  'test-team',
  'player@example.com',
  'Jogador de Teste',
  'Teste',
  'midfielder'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"test-player","email":"player@example.com","role":"authenticated"}',
  true
);

do $$
declare
  membership public.team_members;
  membership_count integer;
begin
  select *
    into membership
  from public.join_team_with_invite_code('abc-123');

  if membership.team_id <> 'test-team'
    or membership.user_id <> 'test-player'
    or membership.player_id <> 'test-player-record'
    or membership.status <> 'active'
  then
    raise exception 'RPC retornou membership incorreto: %', membership;
  end if;

  perform public.join_team_with_invite_code('ABC123');

  select count(*)
    into membership_count
  from public.team_members
  where team_id = 'test-team'
    and user_id = 'test-player';

  if membership_count <> 1 then
    raise exception 'RPC nao e idempotente: % memberships', membership_count;
  end if;
end
$$;

reset role;
rollback;

-- Padroes por time para reduzir o preenchimento repetido de novas partidas.
-- Jogos e presencas antigas nao sao alterados.

alter table public.teams
  add column home_field_location_url text,
  add column default_pix_key text,
  add column default_payment_responsible_name text,
  add column default_match_weekday smallint
    check (default_match_weekday between 1 and 7),
  add column default_attendance_status text not null default 'pending'
    check (default_attendance_status in ('pending', 'absent'));

comment on column public.teams.default_match_weekday is
  'Dia ISO da semana: 1=segunda ate 7=domingo. A tela sugere sempre a proxima ocorrencia futura.';
comment on column public.teams.default_attendance_status is
  'Situacao inicial do elenco em novas partidas. Nao altera presencas antigas.';

create or replace function public.criar_partida(
  p_match jsonb,
  p_player_ids jsonb default '[]'::jsonb
)
returns public.matches
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match public.matches;
  v_id text := nullif(p_match ->> 'id', '');
  v_attendance_status text;
begin
  if v_id is null then
    raise exception 'A partida precisa de um id.' using errcode = '22023';
  end if;

  select coalesce(t.default_attendance_status, 'pending')
    into v_attendance_status
  from public.teams t
  where t.id = p_match ->> 'team_id';

  if v_attendance_status is null then
    raise exception 'Time nao encontrado.' using errcode = 'P0002';
  end if;

  insert into public.matches (
    id, team_id, season_id, date, time, venue, location_url,
    opponent_name, opponent_logo_url, opponent_team_id, opponent_team_name,
    opponent_team_logo_url, opponent_source, line_players_count, match_type,
    notes, status, created_by, created_at, updated_at
  )
  values (
    v_id,
    p_match ->> 'team_id',
    nullif(p_match ->> 'season_id', ''),
    (p_match ->> 'date')::date,
    coalesce(p_match ->> 'time', ''),
    coalesce(p_match ->> 'venue', ''),
    nullif(p_match ->> 'location_url', ''),
    coalesce(p_match ->> 'opponent_name', ''),
    nullif(p_match ->> 'opponent_logo_url', ''),
    nullif(p_match ->> 'opponent_team_id', ''),
    nullif(p_match ->> 'opponent_team_name', ''),
    nullif(p_match ->> 'opponent_team_logo_url', ''),
    nullif(p_match ->> 'opponent_source', ''),
    coalesce((p_match ->> 'line_players_count')::integer, 0),
    coalesce(p_match ->> 'match_type', 'society'),
    nullif(p_match ->> 'notes', ''),
    coalesce(p_match ->> 'status', 'scheduled'),
    nullif(p_match ->> 'created_by', ''),
    now(),
    now()
  )
  returning * into v_match;

  insert into public.attendance (
    id, team_id, match_id, player_id, status, created_at, updated_at
  )
  select
    v_id || '__' || (jogador #>> '{}'),
    v_match.team_id,
    v_id,
    jogador #>> '{}',
    v_attendance_status,
    now(),
    now()
  from jsonb_array_elements(coalesce(p_player_ids, '[]'::jsonb)) as jogador
  where coalesce(jogador #>> '{}', '') <> ''
  on conflict (match_id, player_id) do nothing;

  return v_match;
end;
$$;

revoke all on function public.criar_partida(jsonb, jsonb) from public, anon;
grant execute on function public.criar_partida(jsonb, jsonb) to authenticated;

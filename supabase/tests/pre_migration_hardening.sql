-- Verificacoes estruturais da migration de seguranca pre-migracao.
-- Execute em um banco local reconstruido pelas migrations do projeto.

do $$
declare
  missing_constraints text[];
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and 'anon' = any (roles)
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'Storage ainda possui escrita anonima';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'attendance'
      and cmd = 'ALL'
  ) then
    raise exception 'Attendance ainda possui policy FOR ALL';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'join_team_with_invite_code'
  ) then
    raise exception 'RPC segura de entrada por convite nao foi criada';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('public_team_summaries', 'public_team_roster')
      and column_name in ('invite_code', 'admin_user_id')
  ) then
    raise exception 'View publica expoe coluna sensivel';
  end if;

  select array_agg(required.name order by required.name)
    into missing_constraints
  from (
    values
      ('matches_id_team_id_key'),
      ('players_id_team_id_key'),
      ('lineups_match_team_fkey'),
      ('attendance_match_team_fkey'),
      ('attendance_player_team_fkey'),
      ('match_stats_match_team_fkey'),
      ('match_stats_player_team_fkey'),
      ('mvp_votes_match_team_fkey'),
      ('mvp_votes_voter_team_fkey'),
      ('mvp_votes_target_team_fkey'),
      ('player_ratings_match_team_fkey'),
      ('player_ratings_rater_team_fkey'),
      ('player_ratings_target_team_fkey'),
      ('match_diary_match_team_fkey'),
      ('matches_line_players_count_check'),
      ('matches_time_format_check'),
      ('player_ratings_overall_range_check')
  ) as required(name)
  where not exists (
    select 1
    from pg_constraint c
    where c.conname = required.name
  );

  if missing_constraints is not null then
    raise exception 'Constraints ausentes: %', missing_constraints;
  end if;
end
$$;

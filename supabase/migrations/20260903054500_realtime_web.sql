-- Publica as tabelas do produto no Supabase Realtime. A autorização de INSERT
-- e UPDATE continua sendo filtrada pelas policies RLS de cada pessoa.

do $$
declare
  v_table text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime não encontrada';
  end if;

  foreach v_table in array array[
    'users',
    'teams',
    'seasons',
    'players',
    'team_members',
    'rating_criteria',
    'matches',
    'lineups',
    'attendance',
    'match_stats',
    'mvp_votes',
    'player_ratings',
    'match_diary_entries',
    'notifications',
    'expense_categories',
    'expenses',
    'expense_shares',
    'match_field_costs',
    'match_field_participants'
  ]
  loop
    if to_regclass('public.' || quote_ident(v_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

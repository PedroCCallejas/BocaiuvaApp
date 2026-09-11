-- Execute depois de reconstruir o banco local com as migrations.

do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id in ('player-photos', 'player-videos')
      and public
  ) then
    raise exception 'Bucket de midia pessoal ainda esta publico';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'player_media_select_public'
      and 'anon' = any (roles)
      and cmd = 'SELECT'
  ) then
    raise exception 'Policy de leitura publica controlada nao foi criada';
  end if;

  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'consume_team_push_quota'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'RPC de cota de push foi exposta ao cliente';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    raise exception 'Tabelas do app ainda não foram publicadas no Realtime';
  end if;

  if (
    select count(*)
    from information_schema.referential_constraints
    where constraint_schema = 'public'
      and constraint_name in (
        'matches_created_by_fkey',
        'match_diary_entries_author_user_id_fkey',
        'expenses_created_by_fkey'
      )
      and delete_rule = 'SET NULL'
  ) <> 3 then
    raise exception 'Chaves de autoria ainda bloqueiam a exclusão da conta';
  end if;

  if (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('public_team_summaries', 'public_team_roster')
      and 'security_invoker=true' = any (coalesce(c.reloptions, array[]::text[]))
  ) <> 2 then
    raise exception 'Views publicas ainda executam com privilegios do proprietario';
  end if;

  if has_column_privilege('anon', 'public.teams', 'invite_code', 'SELECT')
    or has_column_privilege('anon', 'public.teams', 'admin_user_id', 'SELECT')
    or has_column_privilege('anon', 'public.teams', 'contact_phone', 'SELECT')
    or has_column_privilege('anon', 'public.teams', 'contact_whatsapp', 'SELECT')
  then
    raise exception 'Papel anonimo ainda consegue ler coluna sensivel do time';
  end if;
end
$$;

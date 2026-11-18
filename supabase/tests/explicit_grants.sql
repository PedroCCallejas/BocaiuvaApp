-- Somente fixtures sinteticas no PostgreSQL descartavel do test:postgres.
begin;

create function pg_temp.expect_denied(statement text) returns void
language plpgsql security invoker as $$
begin
  execute statement;
  raise exception 'Operacao indevidamente permitida: %', statement;
exception when insufficient_privilege then null;
end $$;

insert into public.users(id, email, display_name) values
  ('grants-owner', 'owner@example.invalid', 'Owner'),
  ('grants-account', 'account@example.invalid', 'Account');
insert into public.teams(id, name, slug, primary_color, secondary_color, invite_code,
  admin_user_id, is_public, public_roster_enabled, city, state) values
  ('grants-public', 'Publico', 'grants-public', '#000000', '#ffffff', 'SECRET1',
    'grants-owner', true, true, 'Bocaiuva', 'MG'),
  ('grants-private', 'Privado', 'grants-private', '#000000', '#ffffff', 'SECRET2',
    'grants-owner', false, false, 'Bocaiuva', 'MG');
insert into public.players(id, team_id, full_name, nickname, primary_position,
  linked_user_id, linked_email) values
  ('grants-player', 'grants-public', 'Pessoa', 'Pessoa', 'midfielder',
    'grants-account', 'private@example.invalid'),
  ('grants-private-player', 'grants-private', 'Privado', 'Privado', 'midfielder', null, null);
insert into public.push_subscriptions(endpoint, user_id, p256dh, auth)
values ('https://example.invalid/expired', 'grants-owner', 'synthetic', 'synthetic');

-- ACL de coluna exata para anon: nao basta testar somente o SELECT da view.
do $$
declare item record; allowed boolean;
begin
  for item in
    select c.relname, a.attname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relname in ('teams', 'players')
      and a.attnum > 0 and not a.attisdropped
  loop
    allowed := case when item.relname = 'teams' then item.attname = any(array[
      'id','slug','name','logo_url','banner_url','presentation_video_url',
      'primary_color','secondary_color','accent_color','city','state','neighborhood',
      'home_field_name','public_description','allow_friendly_contact',
      'public_roster_enabled','is_public'])
    else item.attname = any(array['team_id','id','full_name','nickname','photo_url',
      'primary_position','jersey_number','presentation_video_url','status','deleted_at']) end;
    if has_column_privilege('anon', 'public.' || item.relname, item.attname, 'SELECT') <> allowed then
      raise exception 'ACL anon divergente em %.%', item.relname, item.attname;
    end if;
  end loop;
  if exists(select 1 from pg_tables where schemaname = 'public' and not rowsecurity) then
    raise exception 'RLS desabilitada';
  end if;
end $$;

-- Superficie direta exata do service_role em reconstrucoes novas.
do $$
declare t record; op text; expected boolean; a record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    foreach op in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      expected := (op = 'SELECT' and t.tablename = any(array['team_members','players',
        'matches','match_diary_entries','expenses','push_subscriptions','notifications',
        'attendance','mvp_votes','player_ratings']))
        or (op = 'DELETE' and t.tablename in ('users','teams','push_subscriptions'));
      if has_table_privilege('service_role', 'public.' || t.tablename, op) <> expected then
        raise exception 'Grant de tabela service_role inesperado: % %', t.tablename, op;
      end if;
    end loop;
  end loop;
  for a in select attname from pg_attribute where attrelid = 'public.players'::regclass
    and attnum > 0 and not attisdropped loop
    expected := a.attname = any(array['linked_user_id','linked_email','full_name','nickname',
      'photo_url','presentation_video_url','intro_video_url','celebration_video_url','bio','updated_at']);
    if has_column_privilege('service_role', 'public.players', a.attname, 'UPDATE') <> expected then
      raise exception 'UPDATE service_role inesperado: players.%', a.attname;
    end if;
  end loop;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  if (select count(*) from public.public_team_summaries where id like 'grants-%') <> 1
    or (select count(*) from public.public_team_roster where team_id like 'grants-%') <> 1 then
    raise exception 'Views publicas perderam acesso ou vazaram time privado';
  end if;
  -- SELECT * tambem exercita funcoes das views security_invoker.
  perform * from public.public_team_summaries where id = 'grants-public';
  perform * from public.public_team_roster where team_id = 'grants-public';
end $$;
select pg_temp.expect_denied('select * from public.teams');
select pg_temp.expect_denied('select invite_code, contact_phone from public.teams');
select pg_temp.expect_denied('select linked_email, bio from public.players');
select pg_temp.expect_denied('select * from public.users');
select pg_temp.expect_denied('update public.players set nickname = ''forbidden'' where id = ''grants-player''');
select pg_temp.expect_denied('select public.consume_team_push_quota(''a'', ''b'', 1, 300)');

set local role authenticated;
select pg_temp.expect_denied('select public.consume_team_push_quota(''a'', ''b'', 1, 300)');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare table_name text; changed integer;
begin
  -- Todas as leituras de exportar-dados/enviar-push, inclusive SELECT *.
  foreach table_name in array array['team_members','players','matches',
    'match_diary_entries','expenses','push_subscriptions','notifications',
    'attendance','mvp_votes','player_ratings'] loop
    execute format('select * from public.%I limit 1', table_name);
  end loop;
  if (select count(id) from public.teams where admin_user_id = 'grants-owner') <> 2 then
    raise exception 'Preflight excluir-conta sem acesso';
  end if;
  update public.players set linked_user_id = null, linked_email = null,
    full_name = 'Jogador removido', nickname = 'Removido', photo_url = null,
    presentation_video_url = null, intro_video_url = null, celebration_video_url = null,
    bio = null, updated_at = now() where id = 'grants-player';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Anonimizacao nao atingiu o jogador'; end if;
  delete from public.users where id = 'grants-account';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'excluir-conta nao removeu a fixture'; end if;
  delete from public.teams where id = 'grants-private';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'excluir-time nao removeu a fixture'; end if;
  delete from public.push_subscriptions where endpoint = 'https://example.invalid/expired';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Limpeza de endpoint nao removeu a fixture'; end if;
  if not public.consume_team_push_quota('grants-public', 'grants-owner', 1, 300)
    or public.consume_team_push_quota('grants-public', 'grants-owner', 1, 300) then
    raise exception 'RPC de cota nao preservou limite';
  end if;
end $$;
select pg_temp.expect_denied('select email from public.users');
select pg_temp.expect_denied('select invite_code from public.teams');
select pg_temp.expect_denied('update public.players set fee_exemption = null where id = ''grants-player''');
select pg_temp.expect_denied('insert into public.users(id, email) values (''bad'', ''bad@example.invalid'')');
select pg_temp.expect_denied('delete from public.matches where id = ''bad''');

reset role;
do $$
begin
  if exists(select 1 from public.players where id = 'grants-private-player') then
    raise exception 'Cascata exige verificacao';
  end if;
end $$;
-- A migracao nao reativa defaults para futuras tabelas.
create table public.grants_future_probe(id integer);
do $$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name, 'public.grants_future_probe', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Grants automaticos reativados para %', role_name;
    end if;
  end loop;
end $$;
rollback;

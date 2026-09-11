-- Fecha a virada para Supabase no cliente web.
--
-- 1. Fotos e videos pessoais deixam de ser buckets publicos.
-- 2. Membros continuam vendo o elenco; a galeria anonima ve apenas o que o
--    proprio time publicou.
-- 3. O envio de push recebe um limite atomico por pessoa e time.

update storage.buckets
set public = false
where id in ('player-photos', 'player-videos');

create or replace function app.can_read_player_media(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, app, storage, pg_temp
as $$
  with media as (
    select
      split_part(p_name, '/', 1) as team_id,
      case
        when p_bucket = 'player-photos' then
          regexp_replace(split_part(p_name, '/', 2), '\.[^.]+$', '')
        when p_bucket = 'player-videos' then split_part(p_name, '/', 2)
        else ''
      end as player_id,
      case
        when p_bucket = 'player-photos' then
          split_part(p_name, '/', 3) = ''
          and lower(storage.extension(p_name)) in ('jpg', 'jpeg', 'png', 'webp')
        when p_bucket = 'player-videos' then
          split_part(p_name, '/', 3) = 'presentation.mp4'
          and split_part(p_name, '/', 4) = ''
        else false
      end as valid_path
  )
  select coalesce((
    select m.valid_path and (
      app.is_team_member(m.team_id)
      or exists (
        select 1
        from public.players p
        join public.teams t on t.id = p.team_id
        where p.id = m.player_id
          and p.team_id = m.team_id
          and p.status = 'active'
          and p.deleted_at is null
          and t.is_public
          and t.public_roster_enabled
      )
    )
    from media m
  ), false)
$$;

revoke all on function app.can_read_player_media(text, text) from public;
grant execute on function app.can_read_player_media(text, text) to anon, authenticated;

drop policy if exists media_select_authenticated on storage.objects;
drop policy if exists player_media_select_public on storage.objects;

-- SELECT e necessario tanto para baixar quanto para substituir um objeto com
-- upsert. Gestores conservam esse direito; membros ganham apenas leitura.
create policy media_select_authenticated on storage.objects
  for select to authenticated
  using (
    app.can_write_media_object(bucket_id, name)
    or app.can_read_player_media(bucket_id, name)
  );

create policy player_media_select_public on storage.objects
  for select to anon
  using (app.can_read_player_media(bucket_id, name));

create table if not exists app.push_rate_limits (
  team_id text not null,
  user_id text not null,
  window_started_at timestamptz not null,
  dispatch_count integer not null default 0 check (dispatch_count >= 0),
  primary key (team_id, user_id)
);

revoke all on app.push_rate_limits from public, anon, authenticated;

create or replace function public.consume_team_push_quota(
  p_team_id text,
  p_user_id text,
  p_limit integer default 10,
  p_window_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_team_id is null or p_user_id is null or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into app.push_rate_limits as limits (
    team_id,
    user_id,
    window_started_at,
    dispatch_count
  ) values (
    p_team_id,
    p_user_id,
    v_now,
    1
  )
  on conflict (team_id, user_id) do update
  set
    window_started_at = case
      when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then v_now
      else limits.window_started_at
    end,
    dispatch_count = case
      when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then 1
      else limits.dispatch_count + 1
    end
  returning dispatch_count into v_count;

  if v_count > p_limit then
    update app.push_rate_limits
    set dispatch_count = p_limit
    where team_id = p_team_id and user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.consume_team_push_quota(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_team_push_quota(text, text, integer, integer)
  to service_role;

comment on function public.consume_team_push_quota(text, text, integer, integer) is
  'Consumido apenas pela Edge Function de Web Push usando service_role.';

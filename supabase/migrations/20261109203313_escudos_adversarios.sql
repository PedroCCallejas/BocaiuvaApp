-- Preparada para aprovação. Não altera buckets, grants ou acesso entre times.
create or replace function app.can_write_media_object(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, app, storage, pg_temp
as $$
  select case
    when p_bucket = 'team-logos' then
      (
        (split_part(p_name, '/', 3) = '' and split_part(p_name, '/', 2) = 'logo.jpg')
        or p_name ~ '^[^/]+/opponents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
      )
      and app.can_manage_team(split_part(p_name, '/', 1))
    when p_bucket = 'team-banners' then
      split_part(p_name, '/', 3) = ''
      and split_part(p_name, '/', 2) = 'banner.jpg'
      and app.can_manage_team(split_part(p_name, '/', 1))
    when p_bucket = 'team-videos' then
      split_part(p_name, '/', 3) = ''
      and split_part(p_name, '/', 2) = 'presentation.mp4'
      and app.can_manage_team(split_part(p_name, '/', 1))
    when p_bucket = 'player-photos' then
      split_part(p_name, '/', 3) = ''
      and lower(storage.extension(p_name)) in ('jpg', 'jpeg', 'png', 'webp')
      and (
        app.can_manage_players(split_part(p_name, '/', 1))
        or app.is_team_player(
          split_part(p_name, '/', 1),
          regexp_replace(split_part(p_name, '/', 2), '\.[^.]+$', '')
        )
      )
    when p_bucket = 'player-videos' then
      split_part(p_name, '/', 3) = 'presentation.mp4'
      and split_part(p_name, '/', 4) = ''
      and (
        app.can_manage_players(split_part(p_name, '/', 1))
        or app.is_team_player(
          split_part(p_name, '/', 1),
          split_part(p_name, '/', 2)
        )
      )
    else false
  end
$$;

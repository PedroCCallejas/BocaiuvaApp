-- As views publicas deixam de executar com os privilegios do proprietario.
-- Dados que nao podem ser concedidos diretamente ao papel anonimo (contato e
-- partidas) sao reduzidos a projecoes seguras em funcoes do schema nao exposto.

create or replace function app.public_team_contact(p_team_id text)
returns table (
  contact_name text,
  contact_phone text,
  contact_whatsapp text
)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    case when t.allow_friendly_contact then t.contact_name else null end,
    case when t.allow_friendly_contact then t.contact_phone else null end,
    case when t.allow_friendly_contact then t.contact_whatsapp else null end
  from public.teams t
  where t.id = p_team_id
    and t.is_public
$$;

create or replace function app.public_team_stats(p_team_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select jsonb_build_object(
    'games', coalesce(s.games, 0),
    'wins', coalesce(s.wins, 0),
    'draws', coalesce(s.draws, 0),
    'losses', coalesce(s.losses, 0),
    'goalsFor', coalesce(s.goals_for, 0),
    'goalsAgainst', coalesce(s.goals_against, 0),
    'pointsRate', coalesce(s.points_rate, 0)
  )
  from public.teams t
  left join lateral (
    select
      count(*)::integer as games,
      count(*) filter (
        where coalesce((m.scoreboard ->> 'team')::integer, 0)
          > coalesce((m.scoreboard ->> 'opponent')::integer, 0)
      )::integer as wins,
      count(*) filter (
        where coalesce((m.scoreboard ->> 'team')::integer, 0)
          = coalesce((m.scoreboard ->> 'opponent')::integer, 0)
      )::integer as draws,
      count(*) filter (
        where coalesce((m.scoreboard ->> 'team')::integer, 0)
          < coalesce((m.scoreboard ->> 'opponent')::integer, 0)
      )::integer as losses,
      coalesce(sum((m.scoreboard ->> 'team')::integer), 0)::integer as goals_for,
      coalesce(sum((m.scoreboard ->> 'opponent')::integer), 0)::integer as goals_against,
      case
        when count(*) = 0 then 0
        else round(
          (
            count(*) filter (
              where coalesce((m.scoreboard ->> 'team')::integer, 0)
                > coalesce((m.scoreboard ->> 'opponent')::integer, 0)
            ) * 3
            + count(*) filter (
              where coalesce((m.scoreboard ->> 'team')::integer, 0)
                = coalesce((m.scoreboard ->> 'opponent')::integer, 0)
            )
          )::numeric / (count(*) * 3)::numeric * 100,
          1
        )
      end as points_rate
    from public.matches m
    where m.team_id = t.id
      and m.status = 'finished'
      and m.deleted_at is null
      and m.scoreboard is not null
  ) s on true
  where t.id = p_team_id
    and t.is_public
$$;

revoke all on function app.public_team_contact(text) from public;
revoke all on function app.public_team_stats(text) from public;
grant usage on schema app to anon;
grant execute on function app.public_team_contact(text) to anon, authenticated;
grant execute on function app.public_team_stats(text) to anon, authenticated;

revoke select on public.teams from anon;
revoke select on public.players from anon;

grant select (
  id, slug, name, logo_url, banner_url, presentation_video_url,
  primary_color, secondary_color, accent_color, city, state, neighborhood,
  home_field_name, public_description, allow_friendly_contact,
  public_roster_enabled, is_public
) on public.teams to anon;

grant select (
  team_id, id, full_name, nickname, photo_url, primary_position,
  jersey_number, presentation_video_url, status, deleted_at
) on public.players to anon;

drop policy if exists teams_select_public_anon on public.teams;
create policy teams_select_public_anon on public.teams
  for select to anon
  using (is_public);

drop policy if exists players_select_public_anon on public.players;
create policy players_select_public_anon on public.players
  for select to anon
  using (
    status = 'active'
    and deleted_at is null
    and exists (
      select 1
      from public.teams t
      where t.id = players.team_id
        and t.is_public
        and t.public_roster_enabled
    )
  );

create or replace view public.public_team_summaries
with (security_barrier = true, security_invoker = true)
as
select
  t.id,
  t.slug,
  t.name,
  t.logo_url,
  t.banner_url,
  t.presentation_video_url,
  t.primary_color,
  t.secondary_color,
  t.accent_color,
  t.city,
  t.state,
  t.neighborhood,
  t.home_field_name,
  t.public_description,
  t.allow_friendly_contact,
  c.contact_name,
  c.contact_phone,
  c.contact_whatsapp,
  t.public_roster_enabled,
  app.public_team_stats(t.id) as stats
from public.teams t
left join lateral app.public_team_contact(t.id) c on true
where t.is_public
  and nullif(trim(t.city), '') is not null
  and nullif(trim(t.state), '') is not null;

create or replace view public.public_team_roster
with (security_barrier = true, security_invoker = true)
as
select
  p.team_id,
  p.id,
  p.full_name,
  p.nickname,
  p.photo_url,
  p.primary_position,
  p.jersey_number,
  p.presentation_video_url
from public.players p
join public.teams t on t.id = p.team_id
where t.is_public
  and t.public_roster_enabled
  and p.status = 'active'
  and p.deleted_at is null;

revoke all on public.public_team_summaries from public;
revoke all on public.public_team_roster from public;
grant select on public.public_team_summaries to anon, authenticated;
grant select on public.public_team_roster to anon, authenticated;

-- Hardening antes da troca Firestore -> Supabase.
--
-- Esta migration e aditiva: corrige policies antigas sem reescrever o historico
-- que ja pode ter sido aplicado no projeto remoto.

-- ---------------------------------------------------------------------------
-- Privilegios futuros: tabela ou funcao nova nao nasce exposta por acidente.
-- ---------------------------------------------------------------------------

alter default privileges in schema public
  revoke select, insert, update, delete on tables from authenticated;
alter default privileges in schema public
  revoke select on tables from anon;
alter default privileges in schema app
  revoke execute on functions from authenticated, anon;

revoke usage on schema app from anon;
revoke execute on all functions in schema app from anon;
revoke select on all tables in schema public from anon;

-- As tabelas atuais continuam acessiveis ao papel autenticado. RLS decide as
-- linhas; o revoke acima vale para objetos criados daqui para frente.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Conta: sem DELETE pelo cliente e sem escalada por app_role.
-- ---------------------------------------------------------------------------

drop policy if exists users_write_self on public.users;

create policy users_insert_self on public.users
  for insert to authenticated
  with check (
    id = app.current_uid()
    and app_role = 'player'
  );

create policy users_update_self on public.users
  for update to authenticated
  using (id = app.current_uid())
  with check (id = app.current_uid());

create or replace function app.guard_user_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if app.current_uid() = '' then
    return new;
  end if;

  new.id := old.id;
  new.email := old.email;
  new.app_role := old.app_role;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists users_guard_self_edit on public.users;
create trigger users_guard_self_edit
  before update on public.users
  for each row execute function app.guard_user_self_edit();

-- ---------------------------------------------------------------------------
-- Time: gestor nao pode se transformar em proprietario pelo UPDATE comum.
-- ---------------------------------------------------------------------------

create or replace function app.guard_team_owner()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if app.current_uid() <> '' and new.admin_user_id is distinct from old.admin_user_id then
    raise exception 'A transferencia de propriedade exige um fluxo administrativo dedicado.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists teams_guard_owner on public.teams;
create trigger teams_guard_owner
  before update on public.teams
  for each row execute function app.guard_team_owner();

-- ---------------------------------------------------------------------------
-- Convite: a entrada acontece por uma unica RPC transacional.
-- ---------------------------------------------------------------------------

drop policy if exists team_members_insert_self on public.team_members;

create or replace function public.join_team_with_invite_code(p_invite_code text)
returns public.team_members
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_uid text := app.current_uid();
  v_code text := left(upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-Za-z0-9]', '', 'g')), 6);
  v_team_id text;
  v_player_id text;
  v_membership public.team_members;
begin
  if v_uid = '' then
    raise exception 'Autenticacao obrigatoria.' using errcode = '28000';
  end if;

  if length(v_code) < 4 then
    raise exception 'Codigo de convite invalido.' using errcode = '22023';
  end if;

  select t.id
    into v_team_id
  from public.teams t
  where t.invite_code = v_code
  limit 1;

  if v_team_id is null then
    raise exception 'Codigo de convite invalido.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.users u where u.id = v_uid) then
    raise exception 'Crie o perfil da conta antes de entrar no time.' using errcode = '23503';
  end if;

  select p.id
    into v_player_id
  from public.players p
  where p.team_id = v_team_id
    and p.deleted_at is null
    and p.status <> 'inactive'
    and (
      p.linked_user_id = v_uid
      or (
        p.linked_user_id is null
        and app.current_email() <> ''
        and lower(coalesce(p.linked_email, '')) = app.current_email()
      )
    )
  order by case when p.linked_user_id = v_uid then 0 else 1 end, p.created_at
  limit 1;

  insert into public.team_members (
    id,
    team_id,
    user_id,
    player_id,
    invite_code_used,
    roles,
    can_manage_team,
    can_manage_players,
    joined_at,
    status
  )
  values (
    gen_random_uuid()::text,
    v_team_id,
    v_uid,
    v_player_id,
    v_code,
    array['player']::text[],
    false,
    false,
    now(),
    'active'
  )
  on conflict (team_id, user_id) do update
    set status = 'active',
        invite_code_used = excluded.invite_code_used,
        player_id = coalesce(public.team_members.player_id, excluded.player_id),
        updated_at = now()
  returning * into v_membership;

  return v_membership;
end;
$$;

revoke all on function public.join_team_with_invite_code(text) from public, anon;
grant execute on function public.join_team_with_invite_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Presenca: jogador altera somente a propria resposta, nunca identidade/FK.
-- ---------------------------------------------------------------------------

drop policy if exists attendance_write_manager on public.attendance;
drop policy if exists attendance_write_self on public.attendance;

create policy attendance_insert_authenticated on public.attendance
  for insert to authenticated
  with check (
    app.can_manage_team(team_id)
    or (
      app.is_team_player(team_id, player_id)
      and user_id = app.current_uid()
      and exists (
        select 1 from public.matches m
        where m.id = match_id
          and m.team_id = attendance.team_id
          and m.deleted_at is null
      )
    )
  );

create policy attendance_update_authenticated on public.attendance
  for update to authenticated
  using (
    app.can_manage_team(team_id)
    or app.is_team_player(team_id, player_id)
  )
  with check (
    app.can_manage_team(team_id)
    or app.is_team_player(team_id, player_id)
  );

create policy attendance_delete_manager on public.attendance
  for delete to authenticated
  using (app.can_manage_team(team_id));

create or replace function app.guard_attendance_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if app.current_uid() = '' or app.can_manage_team(old.team_id) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.team_id is distinct from old.team_id
     or new.match_id is distinct from old.match_id
     or new.player_id is distinct from old.player_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'O jogador so pode alterar a propria resposta de presenca.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.responded_at := now();
  else
    new.responded_at := old.responded_at;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_guard_self_edit on public.attendance;
create trigger attendance_guard_self_edit
  before update on public.attendance
  for each row execute function app.guard_attendance_self_edit();

-- Avaliador e avaliado precisam ter confirmado presenca na mesma partida.
drop policy if exists player_ratings_insert_self on public.player_ratings;
create policy player_ratings_insert_self on public.player_ratings
  for insert to authenticated
  with check (
    app.is_team_player(team_id, rater_player_id)
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.team_id = player_ratings.team_id
        and m.status = 'finished'
        and m.deleted_at is null
    )
    and exists (
      select 1 from public.attendance a
      where a.match_id = player_ratings.match_id
        and a.team_id = player_ratings.team_id
        and a.player_id = player_ratings.rater_player_id
        and a.status = 'confirmed'
    )
    and exists (
      select 1 from public.attendance a
      where a.match_id = player_ratings.match_id
        and a.team_id = player_ratings.team_id
        and a.player_id = player_ratings.target_player_id
        and a.status = 'confirmed'
    )
  );

-- ---------------------------------------------------------------------------
-- Projecoes publicas: anonimo nunca recebe invite_code ou dados privados.
-- Estas views ignoram a RLS da tabela-base de proposito, mas so projetam campos
-- aprovados. O acesso as tabelas-base continua revogado para anon.
-- ---------------------------------------------------------------------------

create or replace view public.public_team_summaries
with (security_barrier = true)
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
  case when t.allow_friendly_contact then t.contact_name else null end as contact_name,
  case when t.allow_friendly_contact then t.contact_phone else null end as contact_phone,
  case when t.allow_friendly_contact then t.contact_whatsapp else null end as contact_whatsapp,
  t.public_roster_enabled,
  jsonb_build_object(
    'games', coalesce(s.games, 0),
    'wins', coalesce(s.wins, 0),
    'draws', coalesce(s.draws, 0),
    'losses', coalesce(s.losses, 0),
    'goalsFor', coalesce(s.goals_for, 0),
    'goalsAgainst', coalesce(s.goals_against, 0),
    'pointsRate', coalesce(s.points_rate, 0)
  ) as stats
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
where t.is_public
  and nullif(trim(t.city), '') is not null
  and nullif(trim(t.state), '') is not null;

create or replace view public.public_team_roster
with (security_barrier = true)
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

-- ---------------------------------------------------------------------------
-- Storage: leitura continua publica via URL do bucket; escrita exige JWT e
-- permissao no primeiro segmento do caminho.
-- ---------------------------------------------------------------------------

drop policy if exists "Allow upload player photos l7f019_0" on storage.objects;
drop policy if exists "Allow update player photos l7f019_0" on storage.objects;
drop policy if exists "Allow update player photos l7f019_1" on storage.objects;
drop policy if exists "Allow upload players-video o2170k_0" on storage.objects;
drop policy if exists "Allow update players-video o2170k_0" on storage.objects;
drop policy if exists "Allow update players-video o2170k_1" on storage.objects;
drop policy if exists "Allow upload team banners 79korb_0" on storage.objects;
drop policy if exists "Allow update team banners 79korb_0" on storage.objects;
drop policy if exists "Allow update team banners 79korb_1" on storage.objects;
drop policy if exists "Allow upload team logos s6hol4_0" on storage.objects;
drop policy if exists "Allow update team logos s6hol4_0" on storage.objects;
drop policy if exists "Allow update team logos s6hol4_1" on storage.objects;
drop policy if exists "Allow upload team videos puyuh4_0" on storage.objects;
drop policy if exists "Allow update team videos puyuh4_0" on storage.objects;
drop policy if exists "Allow update team videos puyuh4_1" on storage.objects;
drop policy if exists "anon insert allowed media buckets" on storage.objects;
drop policy if exists "anon update allowed media buckets" on storage.objects;

create or replace function app.can_write_media_object(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, app, storage, pg_temp
as $$
  select case
    when p_bucket = 'team-logos' then
      split_part(p_name, '/', 3) = ''
      and split_part(p_name, '/', 2) = 'logo.jpg'
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

grant execute on function app.can_write_media_object(text, text) to authenticated;

create policy media_select_authenticated on storage.objects
  for select to authenticated
  using (app.can_write_media_object(bucket_id, name));

create policy media_insert_authenticated on storage.objects
  for insert to authenticated
  with check (app.can_write_media_object(bucket_id, name));

create policy media_update_authenticated on storage.objects
  for update to authenticated
  using (app.can_write_media_object(bucket_id, name))
  with check (app.can_write_media_object(bucket_id, name));

create policy media_delete_authenticated on storage.objects
  for delete to authenticated
  using (app.can_write_media_object(bucket_id, name));

-- ---------------------------------------------------------------------------
-- Indices de foreign keys usadas por RLS, joins e exclusoes.
-- ---------------------------------------------------------------------------

create index if not exists team_members_player_id_idx
  on public.team_members (player_id) where player_id is not null;
create index if not exists mvp_votes_voter_player_id_idx
  on public.mvp_votes (voter_player_id);
create index if not exists mvp_votes_target_player_id_idx
  on public.mvp_votes (target_player_id);
create index if not exists player_ratings_rater_player_id_idx
  on public.player_ratings (rater_player_id);
create index if not exists notifications_match_id_idx
  on public.notifications (match_id) where match_id is not null;
create index if not exists notifications_player_id_idx
  on public.notifications (player_id) where player_id is not null;
create index if not exists notifications_actor_user_id_idx
  on public.notifications (actor_user_id) where actor_user_id is not null;
create index if not exists notifications_target_user_id_idx
  on public.notifications (target_user_id) where target_user_id is not null;
create index if not exists expenses_paid_by_player_id_idx
  on public.expenses (paid_by_player_id) where paid_by_player_id is not null;
create index if not exists expenses_created_by_idx
  on public.expenses (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- Integridade: uma partida nunca pode apontar para jogador de outro time.
-- ---------------------------------------------------------------------------

alter table public.matches
  add constraint matches_id_team_id_key unique (id, team_id);
alter table public.players
  add constraint players_id_team_id_key unique (id, team_id);

alter table public.lineups
  add constraint lineups_match_team_fkey
  foreign key (match_id, team_id)
  references public.matches (id, team_id) on delete cascade;

alter table public.attendance
  add constraint attendance_match_team_fkey
  foreign key (match_id, team_id)
  references public.matches (id, team_id) on delete cascade;
alter table public.attendance
  add constraint attendance_player_team_fkey
  foreign key (player_id, team_id)
  references public.players (id, team_id) on delete cascade;

alter table public.match_stats
  add constraint match_stats_match_team_fkey
  foreign key (match_id, team_id)
  references public.matches (id, team_id) on delete cascade;
alter table public.match_stats
  add constraint match_stats_player_team_fkey
  foreign key (player_id, team_id)
  references public.players (id, team_id) on delete cascade;

alter table public.mvp_votes
  add constraint mvp_votes_match_team_fkey
  foreign key (match_id, team_id)
  references public.matches (id, team_id) on delete cascade;
alter table public.mvp_votes
  add constraint mvp_votes_voter_team_fkey
  foreign key (voter_player_id, team_id)
  references public.players (id, team_id) on delete cascade;
alter table public.mvp_votes
  add constraint mvp_votes_target_team_fkey
  foreign key (target_player_id, team_id)
  references public.players (id, team_id) on delete cascade;

alter table public.player_ratings
  add constraint player_ratings_match_team_fkey
  foreign key (match_id, team_id)
  references public.matches (id, team_id) on delete cascade;
alter table public.player_ratings
  add constraint player_ratings_rater_team_fkey
  foreign key (rater_player_id, team_id)
  references public.players (id, team_id) on delete cascade;
alter table public.player_ratings
  add constraint player_ratings_target_team_fkey
  foreign key (target_player_id, team_id)
  references public.players (id, team_id) on delete cascade;

alter table public.match_diary_entries
  add constraint match_diary_match_team_fkey
  foreign key (match_id, team_id)
  references public.matches (id, team_id) on delete cascade;

alter table public.matches
  add constraint matches_line_players_count_check
  check (line_players_count between 1 and 15);
alter table public.matches
  add constraint matches_time_format_check
  check (time = '' or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.player_ratings
  add constraint player_ratings_overall_range_check
  check (overall between 0 and 10);

create or replace function app.limit_active_rating_criteria()
returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
declare
  v_entra_no_limite boolean := false;
begin
  if tg_op = 'INSERT' then
    v_entra_no_limite := new.active;
  else
    v_entra_no_limite := new.active
      and (not old.active or new.team_id is distinct from old.team_id);
  end if;

  if v_entra_no_limite
     and (
       select count(*)
       from public.rating_criteria c
       where c.team_id = new.team_id and c.active
     ) >= 12 then
    raise exception 'Use no maximo 12 criterios ativos por time.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists rating_criteria_limit_active on public.rating_criteria;
create trigger rating_criteria_limit_active
  before insert or update of active, team_id on public.rating_criteria
  for each row execute function app.limit_active_rating_criteria();

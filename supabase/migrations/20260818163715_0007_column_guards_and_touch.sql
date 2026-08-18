-- Colunas protegidas.
--
-- RLS decide QUEM escreve na linha, nao QUAIS colunas. Sem isto, a policy de
-- "editar o proprio perfil" deixaria a pessoa mudar o proprio vinculo, status e
-- estatisticas — escalada de privilegio disfarcada de edicao de perfil.
--
-- Quando nao ha JWT de usuario (importacao com service key), o guarda sai da
-- frente: ali quem escreve ja e o servidor.

create or replace function app.guard_player_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if app.current_uid() = '' or app.can_manage_players(new.team_id) then
    return new;
  end if;

  new.team_id := old.team_id;
  new.linked_user_id := old.linked_user_id;
  new.linked_email := old.linked_email;
  new.full_name := old.full_name;
  new.status := old.status;
  new.manual_stats := old.manual_stats;
  new.fee_exemption := old.fee_exemption;
  new.deleted_at := old.deleted_at;
  new.allow_self_edit_jersey_number := old.allow_self_edit_jersey_number;
  new.presentation_video_url := old.presentation_video_url;
  new.primary_position := old.primary_position;

  -- Numero da camisa so muda sozinho se o admin liberou, ou se ainda nao havia.
  if not coalesce(old.allow_self_edit_jersey_number, false)
     and coalesce(old.jersey_number, 0) <> 0 then
    new.jersey_number := old.jersey_number;
  end if;

  return new;
end;
$$;

create trigger players_guard_self_edit
  before update on public.players
  for each row execute function app.guard_player_self_edit();

create or replace function app.guard_notification_read()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if app.current_uid() = '' or app.can_manage_team(new.team_id) then
    return new;
  end if;

  -- Membro comum so marca como lido: tudo o mais volta ao que era, e ele so
  -- pode acrescentar o proprio uid.
  new.team_id := old.team_id;
  new.type := old.type;
  new.title := old.title;
  new.message := old.message;
  new.match_id := old.match_id;
  new.player_id := old.player_id;
  new.entry_id := old.entry_id;
  new.actor_user_id := old.actor_user_id;
  new.target_user_id := old.target_user_id;
  new.created_at := old.created_at;

  new.read_by_user_ids := (
    select array(
      select distinct unnest(old.read_by_user_ids || array[app.current_uid()])
    )
  );

  return new;
end;
$$;

create trigger notifications_guard_read
  before update on public.notifications
  for each row execute function app.guard_notification_read();

-- updated_at automatico.
-- O app manda `updatedAt`, mas confiar no relogio do celular ja rendeu ordem
-- errada de historico.

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'teams', 'seasons', 'players', 'team_members', 'rating_criteria',
    'matches', 'lineups', 'attendance', 'match_stats', 'mvp_votes',
    'player_ratings', 'match_diary_entries', 'notifications',
    'expense_categories', 'expenses'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function app.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end;
$$;

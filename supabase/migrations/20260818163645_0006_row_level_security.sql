-- RLS ligada em tudo. Nenhuma tabela fica aberta.

alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.seasons enable row level security;
alter table public.players enable row level security;
alter table public.team_members enable row level security;
alter table public.rating_criteria enable row level security;
alter table public.matches enable row level security;
alter table public.lineups enable row level security;
alter table public.attendance enable row level security;
alter table public.match_stats enable row level security;
alter table public.mvp_votes enable row level security;
alter table public.player_ratings enable row level security;
alter table public.match_diary_entries enable row level security;
alter table public.notifications enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

-- Conta
create policy users_select_self on public.users
  for select to authenticated
  using (id = app.current_uid());

create policy users_write_self on public.users
  for all to authenticated
  using (id = app.current_uid())
  with check (id = app.current_uid());

-- Time. Time publico e vitrine: qualquer um pode ver, inclusive quem nao entrou.
create policy teams_select on public.teams
  for select to authenticated
  using (is_public or app.is_team_member(id));

create policy teams_insert on public.teams
  for insert to authenticated
  with check (admin_user_id = app.current_uid());

create policy teams_update on public.teams
  for update to authenticated
  using (app.can_manage_team(id))
  with check (app.can_manage_team(id));

create policy teams_delete on public.teams
  for delete to authenticated
  using (admin_user_id = app.current_uid());

-- Vinculo
create policy team_members_select on public.team_members
  for select to authenticated
  using (user_id = app.current_uid() or app.is_team_member(team_id));

-- Entrar no time com o codigo de convite: a pessoa cria o proprio vinculo,
-- sempre como jogador comum e sem permissao de gestao.
create policy team_members_insert_self on public.team_members
  for insert to authenticated
  with check (
    user_id = app.current_uid()
    and not can_manage_team
    and not can_manage_players
    and roles = array['player']::text[]
  );

create policy team_members_insert_admin on public.team_members
  for insert to authenticated
  with check (app.can_manage_team(team_id));

create policy team_members_update_admin on public.team_members
  for update to authenticated
  using (app.can_manage_team(team_id))
  with check (app.can_manage_team(team_id));

create policy team_members_delete_admin on public.team_members
  for delete to authenticated
  using (app.can_manage_team(team_id));

-- Elenco
create policy players_select on public.players
  for select to authenticated
  using (
    app.is_team_member(team_id)
    or linked_user_id = app.current_uid()
    or exists (
      select 1 from public.teams t
      where t.id = players.team_id and t.is_public and t.public_roster_enabled
    )
  );

create policy players_write_manager on public.players
  for all to authenticated
  using (app.can_manage_players(team_id))
  with check (app.can_manage_players(team_id));

-- Edicao do proprio perfil. As colunas sensiveis (vinculo, status, numero,
-- stats manuais) ficam de fora via trigger em 0007.
create policy players_update_self on public.players
  for update to authenticated
  using (app.is_team_player(team_id, id))
  with check (app.is_team_player(team_id, id));

-- Dados do time: leitura para membro, escrita para quem gere
create policy seasons_select on public.seasons
  for select to authenticated using (app.is_team_member(team_id));
create policy seasons_write on public.seasons
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

create policy rating_criteria_select on public.rating_criteria
  for select to authenticated using (app.is_team_member(team_id));
create policy rating_criteria_write on public.rating_criteria
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

create policy matches_select on public.matches
  for select to authenticated using (app.is_team_member(team_id));
create policy matches_write on public.matches
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

create policy lineups_select on public.lineups
  for select to authenticated using (app.is_team_member(team_id));
create policy lineups_write on public.lineups
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

create policy match_stats_select on public.match_stats
  for select to authenticated using (app.is_team_member(team_id));
create policy match_stats_write on public.match_stats
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

create policy match_diary_select on public.match_diary_entries
  for select to authenticated using (app.is_team_member(team_id));
create policy match_diary_write on public.match_diary_entries
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

-- Acoes do jogador. Aqui estava a dor. Agora e uma linha: ou voce gere o time,
-- ou voce e aquele jogador.
create policy attendance_select on public.attendance
  for select to authenticated using (app.is_team_member(team_id));

create policy attendance_write_manager on public.attendance
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

create policy attendance_write_self on public.attendance
  for all to authenticated
  using (app.is_team_player(team_id, player_id))
  with check (app.is_team_player(team_id, player_id));

create policy mvp_votes_select on public.mvp_votes
  for select to authenticated using (app.is_team_member(team_id));

-- Voto so em partida encerrada, e so entre quem confirmou presenca.
create policy mvp_votes_insert_self on public.mvp_votes
  for insert to authenticated
  with check (
    app.is_team_player(team_id, voter_player_id)
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.team_id = mvp_votes.team_id
        and m.status = 'finished' and m.deleted_at is null
    )
    and exists (
      select 1 from public.attendance a
      where a.match_id = mvp_votes.match_id
        and a.player_id = mvp_votes.voter_player_id
        and a.status = 'confirmed'
    )
    and exists (
      select 1 from public.attendance a
      where a.match_id = mvp_votes.match_id
        and a.player_id = mvp_votes.target_player_id
        and a.status = 'confirmed'
    )
  );

create policy mvp_votes_delete_manager on public.mvp_votes
  for delete to authenticated using (app.can_manage_team(team_id));

create policy player_ratings_select on public.player_ratings
  for select to authenticated using (app.is_team_member(team_id));

create policy player_ratings_insert_self on public.player_ratings
  for insert to authenticated
  with check (
    app.is_team_player(team_id, rater_player_id)
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.team_id = player_ratings.team_id
        and m.status = 'finished' and m.deleted_at is null
    )
    and exists (
      select 1 from public.attendance a
      where a.match_id = player_ratings.match_id
        and a.player_id = player_ratings.rater_player_id
        and a.status = 'confirmed'
    )
  );

create policy player_ratings_delete_manager on public.player_ratings
  for delete to authenticated using (app.can_manage_team(team_id));

-- Avisos
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    app.is_team_member(team_id)
    and (target_user_id is null or target_user_id = app.current_uid())
  );

create policy notifications_write_manager on public.notifications
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

-- Marcar como lido e a unica escrita do membro comum; a coluna e protegida
-- pelo trigger em 0007.
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (
    app.is_team_member(team_id)
    and (target_user_id is null or target_user_id = app.current_uid())
  )
  with check (
    app.is_team_member(team_id)
    and (target_user_id is null or target_user_id = app.current_uid())
  );

-- Financeiro: so quem administra
create policy expense_categories_all on public.expense_categories
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

create policy expenses_all on public.expenses
  for all to authenticated
  using (app.can_manage_team(team_id)) with check (app.can_manage_team(team_id));

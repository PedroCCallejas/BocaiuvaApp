-- Dados sintéticos persistidos somente no contêiner descartável de QA.
insert into public.users(id, email, display_name, app_role)
values ('backup-owner', 'backup@example.invalid', 'Organizador sintético', 'team_admin');
insert into public.teams(id, name, slug, primary_color, secondary_color, invite_code, admin_user_id)
values ('backup-team', 'Time sintético', 'backup-team', '#111111', '#ffffff', 'QABK01', 'backup-owner');
insert into public.players(id, team_id, full_name, nickname, primary_position)
values ('backup-player', 'backup-team', 'Jogador sintético', 'QA', 'midfielder');
insert into public.matches(id, team_id, date, created_by, opponent_name, line_players_count)
values ('backup-match', 'backup-team', '2026-10-16', 'backup-owner', 'Adversário sintético', 6);

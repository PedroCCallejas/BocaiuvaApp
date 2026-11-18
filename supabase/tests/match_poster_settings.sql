-- Somente em banco local reconstruído. Todos os registros são fictícios.
begin;

insert into public.users(id, email, display_name, app_role) values
  ('qa-owner-a', 'owner-a@example.invalid', 'Owner A', 'team_admin'),
  ('qa-owner-b', 'owner-b@example.invalid', 'Owner B', 'team_admin'),
  ('qa-player-a', 'player-a@example.invalid', 'Player A', 'player'),
  ('qa-outsider', 'outsider@example.invalid', 'Outsider', 'player');
insert into public.teams(id, name, slug, primary_color, secondary_color, invite_code, admin_user_id) values
  ('qa-team-a', 'QA A', 'qa-team-a', '#111111', '#ffffff', 'QAAA01', 'qa-owner-a'),
  ('qa-team-b', 'QA B', 'qa-team-b', '#111111', '#ffffff', 'QABB01', 'qa-owner-b');
insert into public.players(id, team_id, full_name, nickname, primary_position, linked_user_id) values
  ('qa-player-record-a', 'qa-team-a', 'Player A', 'A', 'midfielder', 'qa-player-a'),
  ('qa-player-record-b', 'qa-team-b', 'Player B', 'B', 'midfielder', 'qa-owner-b');
insert into public.team_members(id, team_id, user_id, player_id, roles, can_manage_team, can_manage_players, status) values
  ('qa-member-owner-a', 'qa-team-a', 'qa-owner-a', null, array['admin'], true, true, 'active'),
  ('qa-member-owner-b', 'qa-team-b', 'qa-owner-b', 'qa-player-record-b', array['admin'], true, true, 'active'),
  ('qa-member-player-a', 'qa-team-a', 'qa-player-a', 'qa-player-record-a', array['player'], false, false, 'active');

insert into public.matches(id,team_id,date,time,venue,opponent_name,created_by,line_players_count) values
 ('qa-poster-match','qa-team-a','2026-11-15','09:30','QA field','QA rival','qa-owner-a',6);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"qa-owner-a","role":"authenticated"}', true);
update public.matches set poster_settings='{"version":1,"logoUrl":null,"x":20,"y":-10,"scale":1.2,"removeBackground":true}' where id='qa-poster-match';
do $$ begin
 if not exists(select 1 from public.matches where id='qa-poster-match' and poster_settings->>'x'='20'
   and venue='QA field' and time='09:30' and status='scheduled') then raise exception 'Admin settings save changed or lost match data'; end if;
 begin
  update public.matches set poster_settings='{"version":1,"logoUrl":null,"x":301,"y":0,"scale":1,"removeBackground":false}' where id='qa-poster-match';
  raise exception 'Out of bounds accepted';
 exception when check_violation then null; end;
 begin
  update public.matches set poster_settings='{}' where id='qa-poster-match';
  raise exception 'Missing keys accepted';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"qa-player-a","role":"authenticated"}', true);
do $$ declare affected integer; begin
 update public.matches set poster_settings=null where id='qa-poster-match';
 get diagnostics affected=row_count;
 if affected <> 0 then raise exception 'Player changed artwork'; end if;
 if not exists(select 1 from public.matches where id='qa-poster-match' and poster_settings->>'x'='20') then raise exception 'Member cannot read saved settings'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"qa-owner-b","role":"authenticated"}', true);
do $$ declare affected integer; begin
 update public.matches set poster_settings=null where id='qa-poster-match';
 get diagnostics affected=row_count;
 if affected <> 0 then raise exception 'Another team changed artwork'; end if;
 if exists(select 1 from public.matches where id='qa-poster-match') then raise exception 'Another team read artwork'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"qa-owner-a","role":"authenticated"}', true);
update public.matches set poster_settings=null where id='qa-poster-match';
do $$ begin
 if not exists(select 1 from public.matches where id='qa-poster-match' and poster_settings is null) then raise exception 'Reset not saved'; end if;
end $$;
rollback;

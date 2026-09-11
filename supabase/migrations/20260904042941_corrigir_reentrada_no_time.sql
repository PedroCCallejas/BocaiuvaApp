create or replace function public.join_team_with_invite_code(p_invite_code text)
returns public.team_members
language plpgsql
security definer
set search_path = ''
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
  from public.team_members m
  join public.players p
    on p.id = m.player_id
   and p.team_id = m.team_id
  where m.team_id = v_team_id
    and m.user_id = v_uid
    and p.deleted_at is null
    and p.status <> 'inactive'
  limit 1;

  if v_player_id is null then
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
  end if;

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
        player_id = excluded.player_id,
        updated_at = now()
  returning * into v_membership;

  update public.users
  set active_team_id = v_team_id,
      updated_at = now()
  where id = v_uid;

  return v_membership;
end;
$$;

revoke all on function public.join_team_with_invite_code(text) from public, anon;
grant execute on function public.join_team_with_invite_code(text) to authenticated;

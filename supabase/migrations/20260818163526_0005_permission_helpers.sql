-- Permissao em um lugar so.
--
-- No Firestore a resposta de "quem e essa pessoa neste time" nao podia ser uma
-- consulta, entao foi replicada em varias regras e num indice espelhado
-- (teamMembershipIndex). Quando o indice ficava sem `playerId`, a pessoa levava
-- permission-denied ao confirmar presenca, votar no MVP e avaliar — enquanto o
-- colega de time, com o mesmo perfil, conseguia.
--
-- Aqui a resposta e uma consulta. `security definer` para as policies poderem
-- chamar sem cair em recursao ao ler team_members.

create or replace function app.is_team_member(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select exists (
    select 1
    from public.team_members m
    where m.team_id = p_team_id
      and m.user_id = app.current_uid()
      and m.status = 'active'
  )
$$;

create or replace function app.can_manage_team(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select exists (
    select 1
    from public.team_members m
    where m.team_id = p_team_id
      and m.user_id = app.current_uid()
      and m.status = 'active'
      and (m.can_manage_team or 'admin' = any (m.roles))
  )
  or exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.admin_user_id = app.current_uid()
  )
$$;

create or replace function app.can_manage_players(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select app.can_manage_team(p_team_id)
  or exists (
    select 1
    from public.team_members m
    where m.team_id = p_team_id
      and m.user_id = app.current_uid()
      and m.status = 'active'
      and m.can_manage_players
  )
$$;

-- Qual jogador do time e esta pessoa.
--
-- Duas fontes, na ordem: o vinculo ja gravado e, se ele ainda estiver vazio, o
-- cadastro que o admin reservou para a conta (por uid ou por e-mail). E o mesmo
-- criterio que o app usa em memoria — a diferenca e que agora o banco enxerga
-- os dois, entao a pessoa nao depende de uma escrita que pode nunca acontecer.
create or replace function app.current_player_id(p_team_id text)
returns text
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select coalesce(
    (
      select m.player_id
      from public.team_members m
      where m.team_id = p_team_id
        and m.user_id = app.current_uid()
        and m.status = 'active'
        and m.player_id is not null
      limit 1
    ),
    (
      select p.id
      from public.players p
      where p.team_id = p_team_id
        and p.deleted_at is null
        and p.status <> 'inactive'
        and (
          p.linked_user_id = app.current_uid()
          or (
            coalesce(p.linked_user_id, '') = ''
            and app.current_email() <> ''
            and lower(coalesce(p.linked_email, '')) = app.current_email()
          )
        )
      limit 1
    )
  )
$$;

create or replace function app.is_team_player(p_team_id text, p_player_id text)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select app.is_team_member(p_team_id)
    and p_player_id is not null
    and app.current_player_id(p_team_id) = p_player_id
$$;

comment on function app.current_player_id is
  'Jogador correspondente a conta autenticada no time. Aceita vinculo gravado ou cadastro reservado por uid/e-mail.';

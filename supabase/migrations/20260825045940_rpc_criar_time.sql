-- Criar time: a operação que não cabe nas policies.
--
-- É um ovo e galinha. `team_members_insert_admin` exige
-- `app.can_manage_team(team_id)`, mas quem acabou de criar o time ainda não tem
-- vínculo nenhum — então não consegue criar o próprio vínculo de admin. Sem uma
-- função, o time nasceria sem dono.
--
-- Por isso `security definer`, e por isso o escopo é o menor possível: só o
-- bloco que precisa furar a policy. Os critérios de avaliação padrão continuam
-- sendo criados pelo app, depois, com o vínculo já de pé — os rótulos vivem em
-- `src/lib/rating-criteria.ts` e repeti-los aqui criaria um segundo lugar para
-- divergir.
--
-- `search_path` fixo porque `security definer` sem isso é um convite a
-- sequestro de resolução de nome.

create or replace function public.create_team_with_admin(
  p_name text,
  p_coach_name text,
  p_primary_color text,
  p_secondary_color text,
  p_accent_color text default null,
  p_description text default null,
  p_logo_url text default null,
  p_banner_url text default null,
  p_presentation_video_url text default null
)
returns public.teams
language plpgsql
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
declare
  v_uid text := app.current_uid();
  v_email text := app.current_email();
  v_nome text := btrim(coalesce(p_name, ''));
  v_team_id text := gen_random_uuid()::text;
  v_player_id text := gen_random_uuid()::text;
  v_slug_base text;
  v_slug text;
  v_code text;
  v_tentativa int := 0;
  v_display_name text;
  v_time public.teams;
begin
  if v_uid = '' then
    raise exception 'Autenticacao obrigatoria.' using errcode = '28000';
  end if;

  if length(v_nome) < 2 then
    raise exception 'Informe o nome do time.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.users u where u.id = v_uid) then
    raise exception 'Crie o perfil da conta antes de criar um time.' using errcode = '23503';
  end if;

  -- Mesmo limite do app (MAX_OWNED_TEAMS_PER_ACCOUNT). Fica aqui tambem porque
  -- checagem que so existe no cliente nao e limite, e sim sugestao.
  if (select count(*) from public.teams t where t.admin_user_id = v_uid) >= 2 then
    raise exception 'Voce ja atingiu o limite de 2 times por conta.' using errcode = '23514';
  end if;

  -- Slug e unico no Postgres e nao era no Firestore. Dois times com o mesmo
  -- nome sao normais no futebol de varzea, entao desempata com sufixo em vez
  -- de recusar o cadastro.
  -- `translate` em vez da extensao `unaccent`: cobre o acento que aparece em
  -- nome de time brasileiro e nao adiciona dependencia de extensao so para
  -- isso. Espelha o `slugifyTeamName` do app.
  v_slug_base := regexp_replace(
    regexp_replace(
      translate(
        lower(v_nome),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-z0-9]+', '-', 'g'
    ),
    '(^-|-$)', '', 'g'
  );

  if v_slug_base = '' then
    v_slug_base := 'time';
  end if;

  v_slug := v_slug_base;

  while exists (select 1 from public.teams t where t.slug = v_slug) loop
    v_tentativa := v_tentativa + 1;
    v_slug := v_slug_base || '-' || v_tentativa::text;
  end loop;

  -- Codigo de convite: alfabeto sem 0/O/1/I, os que a pessoa erra ao digitar
  -- do print no grupo do WhatsApp.
  v_tentativa := 0;

  loop
    v_code := '';

    for i in 1..6 loop
      v_code := v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                 1 + floor(random() * 32)::int, 1);
    end loop;

    exit when not exists (select 1 from public.teams t where t.invite_code = v_code);

    v_tentativa := v_tentativa + 1;

    if v_tentativa > 20 then
      raise exception 'Nao foi possivel gerar um codigo de convite.' using errcode = '55000';
    end if;
  end loop;

  insert into public.teams (
    id, name, slug, logo_url, banner_url, presentation_video_url,
    is_public, primary_color, secondary_color, accent_color, description,
    invite_code, invite_code_updated_at, coach_name, admin_user_id,
    created_at, updated_at
  )
  values (
    v_team_id, v_nome, v_slug,
    nullif(btrim(coalesce(p_logo_url, '')), ''),
    nullif(btrim(coalesce(p_banner_url, '')), ''),
    nullif(btrim(coalesce(p_presentation_video_url, '')), ''),
    false, p_primary_color, p_secondary_color,
    nullif(btrim(coalesce(p_accent_color, '')), ''),
    coalesce(btrim(p_description), ''),
    v_code, now(), btrim(coalesce(p_coach_name, '')), v_uid,
    now(), now()
  )
  returning * into v_time;

  select coalesce(nullif(btrim(u.display_name), ''), split_part(coalesce(u.email, ''), '@', 1))
    into v_display_name
  from public.users u
  where u.id = v_uid;

  -- Quem cria o time tambem joga. Sem esta ficha, o admin apareceria fora do
  -- proprio elenco e nao poderia ser escalado.
  insert into public.players (
    id, team_id, linked_user_id, linked_email, full_name, nickname,
    jersey_number, primary_position, dominant_foot, status,
    allow_self_edit_jersey_number, created_at, updated_at
  )
  values (
    v_player_id, v_team_id, v_uid, nullif(lower(v_email), ''),
    coalesce(v_display_name, 'Jogador'), coalesce(v_display_name, 'Jogador'),
    10, 'midfielder', 'right', 'active',
    true, now(), now()
  );

  insert into public.team_members (
    id, team_id, user_id, player_id, invite_code_used,
    roles, can_manage_team, can_manage_players, joined_at, status,
    created_at, updated_at
  )
  values (
    gen_random_uuid()::text, v_team_id, v_uid, v_player_id, null,
    array['admin', 'player']::text[], true, true, now(), 'active',
    now(), now()
  );

  -- Entra ja no time recem-criado: e o que a pessoa quer ver a seguir.
  update public.users
     set active_team_id = v_team_id,
         updated_at = now()
   where id = v_uid;

  return v_time;
end;
$$;

revoke all on function public.create_team_with_admin(
  text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.create_team_with_admin(
  text, text, text, text, text, text, text, text, text
) to authenticated;

-- Operacoes de partida que nao podem falhar pela metade.
--
-- No Firestore cada uma delas era um `writeBatch` — tudo ou nada. Aqui viram
-- funcoes, pelo mesmo motivo: partida encerrada sem estatistica, ou estatistica
-- sem partida, deixa o historico mentindo e ninguem percebe na hora.
--
-- Todas `security invoker`: a funcao NAO ganha privilegio. A RLS de `matches`,
-- `attendance` e `match_stats` continua valendo para quem chamou.

-- ── Criar partida com a lista de presenca ─────────────────────────────────
--
-- A partida nasce com uma linha de presenca por jogador ativo, em `pending`.
-- Sem isso o time nao teria em que clicar para confirmar, e a tela precisaria
-- inventar as linhas na hora de exibir.

create or replace function public.criar_partida(
  p_match jsonb,
  p_player_ids jsonb default '[]'::jsonb
)
returns public.matches
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_match public.matches;
  v_id text := nullif(p_match ->> 'id', '');
begin
  if v_id is null then
    raise exception 'A partida precisa de um id.' using errcode = '22023';
  end if;

  insert into public.matches (
    id, team_id, season_id, date, time, venue, location_url,
    opponent_name, opponent_logo_url, opponent_team_id, opponent_team_name,
    opponent_team_logo_url, opponent_source, line_players_count, match_type,
    notes, status, created_by, created_at, updated_at
  )
  values (
    v_id,
    p_match ->> 'team_id',
    nullif(p_match ->> 'season_id', ''),
    (p_match ->> 'date')::date,
    coalesce(p_match ->> 'time', ''),
    coalesce(p_match ->> 'venue', ''),
    nullif(p_match ->> 'location_url', ''),
    coalesce(p_match ->> 'opponent_name', ''),
    nullif(p_match ->> 'opponent_logo_url', ''),
    nullif(p_match ->> 'opponent_team_id', ''),
    nullif(p_match ->> 'opponent_team_name', ''),
    nullif(p_match ->> 'opponent_team_logo_url', ''),
    nullif(p_match ->> 'opponent_source', ''),
    coalesce((p_match ->> 'line_players_count')::integer, 0),
    coalesce(p_match ->> 'match_type', 'society'),
    nullif(p_match ->> 'notes', ''),
    coalesce(p_match ->> 'status', 'scheduled'),
    nullif(p_match ->> 'created_by', ''),
    now(),
    now()
  )
  returning * into v_match;

  insert into public.attendance (id, team_id, match_id, player_id, status, created_at, updated_at)
  select
    v_id || '__' || (jogador #>> '{}'),
    v_match.team_id,
    v_id,
    jogador #>> '{}',
    'pending',
    now(),
    now()
  from jsonb_array_elements(coalesce(p_player_ids, '[]'::jsonb)) as jogador
  where coalesce(jogador #>> '{}', '') <> ''
  on conflict (match_id, player_id) do nothing;

  return v_match;
end;
$$;

comment on function public.criar_partida is
  'Cria a partida e a lista de presenca inicial numa transacao.';

-- ── Encerrar partida ──────────────────────────────────────────────────────
--
-- Grava placar e status, apaga as estatisticas que nao valem mais e insere as
-- novas. As tres coisas juntas: encerrar sem estatistica deixaria o jogo sem
-- gols, e estatistica de quem nao jogou entraria no ranking.

create or replace function public.encerrar_partida(
  p_match_id text,
  p_scoreboard jsonb,
  p_stats jsonb default '[]'::jsonb,
  p_finished_at timestamptz default now()
)
returns public.matches
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_match public.matches;
  v_team_id text;
begin
  select team_id into v_team_id from public.matches where id = p_match_id;

  if v_team_id is null then
    raise exception 'Partida nao encontrada.' using errcode = 'P0002';
  end if;

  update public.matches
  set
    status = 'finished',
    scoreboard = p_scoreboard,
    finished_at = p_finished_at,
    updated_at = now()
  where id = p_match_id
  returning * into v_match;

  -- Troca o conjunto inteiro em vez de casar linha a linha. A lista chega
  -- recalculada e diferenca incremental so traria caso de borda.
  delete from public.match_stats where match_id = p_match_id;

  insert into public.match_stats (
    id, team_id, match_id, player_id, played, started,
    goals, assists, yellow_cards, red_cards, notes, created_at, updated_at
  )
  select
    p_match_id || '__' || (stat ->> 'player_id'),
    v_team_id,
    p_match_id,
    stat ->> 'player_id',
    coalesce((stat ->> 'played')::boolean, false),
    coalesce((stat ->> 'started')::boolean, false),
    greatest(coalesce((stat ->> 'goals')::integer, 0), 0),
    greatest(coalesce((stat ->> 'assists')::integer, 0), 0),
    greatest(coalesce((stat ->> 'yellow_cards')::integer, 0), 0),
    greatest(coalesce((stat ->> 'red_cards')::integer, 0), 0),
    nullif(stat ->> 'notes', ''),
    now(),
    now()
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) as stat
  where coalesce(stat ->> 'player_id', '') <> '';

  return v_match;
end;
$$;

comment on function public.encerrar_partida is
  'Encerra a partida e substitui as estatisticas numa transacao.';

-- ── Custo do campo ────────────────────────────────────────────────────────
--
-- Valor e participantes vivem em duas tabelas desde a normalizacao. Gravar
-- separado poderia deixar o valor sem quem paga, e o painel de pendencias
-- passaria a mentir sobre quem deve.

create or replace function public.salvar_custo_do_campo(
  p_match_id text,
  p_custo jsonb,
  p_participantes jsonb default '[]'::jsonb
)
returns public.match_field_costs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_custo public.match_field_costs;
begin
  insert into public.match_field_costs (
    match_id, total_amount_cents, split_count, amount_per_player_cents,
    note, pix_key, responsible_name, paid_guest_count, updated_by_user_id,
    created_at, updated_at
  )
  values (
    p_match_id,
    greatest(coalesce((p_custo ->> 'total_amount_cents')::integer, 0), 0),
    greatest(coalesce((p_custo ->> 'split_count')::integer, 0), 0),
    greatest(coalesce((p_custo ->> 'amount_per_player_cents')::integer, 0), 0),
    nullif(p_custo ->> 'note', ''),
    nullif(p_custo ->> 'pix_key', ''),
    nullif(p_custo ->> 'responsible_name', ''),
    greatest(coalesce((p_custo ->> 'paid_guest_count')::integer, 0), 0),
    nullif(p_custo ->> 'updated_by_user_id', ''),
    now(),
    now()
  )
  on conflict (match_id) do update set
    total_amount_cents = excluded.total_amount_cents,
    split_count = excluded.split_count,
    amount_per_player_cents = excluded.amount_per_player_cents,
    note = excluded.note,
    pix_key = excluded.pix_key,
    responsible_name = excluded.responsible_name,
    paid_guest_count = excluded.paid_guest_count,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into v_custo;

  delete from public.match_field_participants where match_id = p_match_id;

  -- A chave primaria (match_id, player_id) ja impede pagante e isento ao mesmo
  -- tempo. `distinct on` protege contra a lista chegar com o mesmo id repetido.
  insert into public.match_field_participants (match_id, player_id, role, created_at, updated_at)
  select distinct on (participante ->> 'player_id')
    p_match_id,
    participante ->> 'player_id',
    participante ->> 'role',
    now(),
    now()
  from jsonb_array_elements(coalesce(p_participantes, '[]'::jsonb)) as participante
  where coalesce(participante ->> 'player_id', '') <> ''
    and coalesce(participante ->> 'role', '') in ('payer', 'exempt')
  -- Pagou vence isento: apagar esse fato criaria devedor que ja acertou.
  order by participante ->> 'player_id', (participante ->> 'role') = 'payer' desc;

  return v_custo;
end;
$$;

comment on function public.salvar_custo_do_campo is
  'Grava valor do campo e quem paga/e isento numa transacao.';

grant execute on function public.criar_partida(jsonb, jsonb) to authenticated;
grant execute on function public.encerrar_partida(text, jsonb, jsonb, timestamptz) to authenticated;
grant execute on function public.salvar_custo_do_campo(text, jsonb, jsonb) to authenticated;

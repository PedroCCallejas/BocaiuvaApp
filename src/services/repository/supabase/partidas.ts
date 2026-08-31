/**
 * Partidas, presença, escalação e estatística no Postgres.
 *
 * O bloco pesado da migração: `attendance` e `match_stats` são 79% do banco, e
 * é aqui que está o ganho de cota que motivou tudo.
 *
 * As quatro tabelas migram juntas por necessidade, não por conveniência: o
 * `finishMatch` grava partida e estatística numa operação só, e separá-las
 * significaria escrever em dois bancos sem transação possível entre eles.
 *
 * O que continua no Firestore: **notificações**. São efeito colateral e já eram
 * best-effort — encerrar a partida não pode falhar porque o aviso falhou.
 */

import { supabase } from '@/config/supabase/client';
import {
  paraEscalacao,
  paraEstatistica,
  paraPartida,
  paraPresenca,
  type LinhaDeCustoDeCampo,
  type LinhaDeParticipanteDoCampo,
} from '@/lib/migracao/mapear-dominio';
import { centsFromAmount } from '@/lib/money';
import { todasAsLinhas } from '@/services/repository/supabase/paginacao';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';
import type {
  AttendanceRecord,
  Lineup,
  Match,
  MatchStat,
} from '@/types/domain';

function cliente() {
  if (!supabase) {
    throw criarErroDoRepositorio(
      'A conexão com o banco não está configurada.',
      'failed-precondition',
    );
  }

  return supabase;
}

function agora() {
  return new Date().toISOString();
}

/** Id no mesmo formato do Firestore, para os dois bancos conviverem. */
export function novoId() {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';

  for (let i = 0; i < 20; i += 1) {
    id += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }

  return id;
}

/**
 * Id composto, igual ao do Firestore.
 *
 * `attendance` e `match_stats` usam `matchId__playerId`. Manter o formato é o
 * que permite reimportar sem duplicar e os dois bancos conviverem.
 */
function idComposto(...partes: string[]) {
  return partes.join('__');
}

// ── Leitura ────────────────────────────────────────────────────────────────

export interface FatiaDePartidas {
  matches: Match[];
  attendance: AttendanceRecord[];
  lineups: Lineup[];
  matchStats: MatchStat[];
}

export const PARTIDAS_VAZIAS: FatiaDePartidas = {
  matches: [],
  attendance: [],
  lineups: [],
  matchStats: [],
};

/**
 * Lê tudo do time numa rodada.
 *
 * Cinco consultas em paralelo em vez de joins aninhados: o formato aninhado do
 * PostgREST muda conforme a versão e deixaria o mapeamento refém disso.
 */
export async function buscarPartidas(teamId: string): Promise<FatiaDePartidas> {
  const supabaseClient = cliente();

  // Tudo paginado: o PostgREST corta em 1000 linhas sem avisar, e `attendance`
  // ja passou disso. A ordenacao por `id` nao e estetica — sem ordem estavel as
  // paginas se embaralham e a mesma linha pode vir duas vezes.
  const [partidas, presencas, escalacoes, estatisticas, custos, participantes] =
    await Promise.all([
      todasAsLinhas((de, ate) =>
        supabaseClient
          .from('matches')
          .select('*')
          .eq('team_id', teamId)
          .order('date', { ascending: false })
          .order('id')
          .range(de, ate),
      ),
      todasAsLinhas((de, ate) =>
        supabaseClient
          .from('attendance')
          .select('*')
          .eq('team_id', teamId)
          .order('id')
          .range(de, ate),
      ),
      todasAsLinhas((de, ate) =>
        supabaseClient.from('lineups').select('*').eq('team_id', teamId).order('id').range(de, ate),
      ),
      todasAsLinhas((de, ate) =>
        supabaseClient
          .from('match_stats')
          .select('*')
          .eq('team_id', teamId)
          .order('id')
          .range(de, ate),
      ),
      todasAsLinhas((de, ate) =>
        supabaseClient.from('match_field_costs').select('*').order('match_id').range(de, ate),
      ),
      todasAsLinhas((de, ate) =>
        supabaseClient
          .from('match_field_participants')
          .select('*')
          .order('match_id')
          .order('player_id')
          .range(de, ate),
      ),
    ]);

  for (const resposta of [partidas, presencas, escalacoes, estatisticas, custos, participantes]) {
    if (resposta.error) {
      throw traduzirErroDoPostgres(resposta.error, 'Não foi possível carregar as partidas agora.');
    }
  }

  const custoPorPartida = new Map<string, LinhaDeCustoDeCampo>();

  for (const linha of custos.data ?? []) {
    const matchId = (linha as { match_id?: unknown }).match_id;

    if (typeof matchId === 'string') {
      custoPorPartida.set(matchId, linha as LinhaDeCustoDeCampo);
    }
  }

  const listaDeParticipantes = (participantes.data ?? []) as LinhaDeParticipanteDoCampo[];

  return {
    matches: (partidas.data ?? []).map((linha) =>
      paraPartida(
        linha,
        custoPorPartida.get(String((linha as { id?: unknown }).id ?? '')) ?? null,
        listaDeParticipantes,
      ),
    ),
    attendance: (presencas.data ?? []).map(paraPresenca),
    lineups: (escalacoes.data ?? []).map(paraEscalacao),
    matchStats: (estatisticas.data ?? []).map(paraEstatistica),
  };
}

async function buscarPartidaPorId(matchId: string): Promise<Match> {
  const supabaseClient = cliente();

  const [partida, custo, participantes] = await Promise.all([
    supabaseClient.from('matches').select('*').eq('id', matchId).maybeSingle(),
    supabaseClient.from('match_field_costs').select('*').eq('match_id', matchId).maybeSingle(),
    supabaseClient.from('match_field_participants').select('*').eq('match_id', matchId),
  ]);

  if (partida.error) {
    throw traduzirErroDoPostgres(partida.error, 'Não foi possível carregar a partida agora.');
  }

  if (!partida.data) {
    throw criarErroDoRepositorio('Partida não encontrada.', 'not-found');
  }

  return paraPartida(
    partida.data,
    (custo.data ?? null) as LinhaDeCustoDeCampo | null,
    (participantes.data ?? []) as LinhaDeParticipanteDoCampo[],
  );
}

// ── Partida ────────────────────────────────────────────────────────────────

export async function criarPartida(input: {
  teamId: string;
  actorUserId: string;
  date: string;
  time: string;
  venue: string;
  locationUrl?: string | null;
  opponentName: string;
  opponentLogoUrl?: string | null;
  opponentTeamId?: string | null;
  opponentTeamName?: string | null;
  opponentTeamLogoUrl?: string | null;
  opponentSource?: string | null;
  linePlayersCount: number;
  matchType: string;
  notes?: string | null;
  seasonId?: string | null;
  playerIds: string[];
}): Promise<Match> {
  const { data, error } = await cliente().rpc('criar_partida', {
    p_match: {
      id: novoId(),
      team_id: input.teamId,
      season_id: input.seasonId ?? null,
      date: input.date,
      time: input.time,
      venue: input.venue,
      location_url: input.locationUrl ?? null,
      opponent_name: input.opponentName,
      opponent_logo_url: input.opponentLogoUrl ?? null,
      opponent_team_id: input.opponentTeamId ?? null,
      opponent_team_name: input.opponentTeamName ?? null,
      opponent_team_logo_url: input.opponentTeamLogoUrl ?? null,
      opponent_source: input.opponentSource ?? null,
      line_players_count: input.linePlayersCount,
      match_type: input.matchType,
      notes: input.notes ?? null,
      status: 'scheduled',
      created_by: input.actorUserId,
    },
    p_player_ids: [...new Set(input.playerIds)],
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível criar a partida agora.');
  }

  return paraPartida((data ?? {}) as Record<string, unknown>);
}

/**
 * Campos livres da partida.
 *
 * `team_id`, `created_by` e `status` ficam de fora: partida não troca de time
 * nem de autor, e mudar status é `encerrar_partida` ou `deleteMatch`, que têm
 * consequência em outras tabelas.
 */
export async function atualizarPartida(
  matchId: string,
  mudancas: Record<string, unknown>,
): Promise<Match> {
  const { error } = await cliente()
    .from('matches')
    .update({ ...mudancas, updated_at: agora() })
    .eq('id', matchId);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar a partida agora.');
  }

  return await buscarPartidaPorId(matchId);
}

export async function encerrarPartida(input: {
  matchId: string;
  scoreboard: Record<string, unknown>;
  stats: {
    playerId: string;
    played: boolean;
    started?: boolean;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    notes?: string | null;
  }[];
}): Promise<Match> {
  const { error } = await cliente().rpc('encerrar_partida', {
    p_match_id: input.matchId,
    p_scoreboard: input.scoreboard,
    p_stats: input.stats.map((stat) => ({
      player_id: stat.playerId,
      played: stat.played,
      started: stat.started ?? false,
      goals: stat.goals,
      assists: stat.assists,
      yellow_cards: stat.yellowCards,
      red_cards: stat.redCards,
      notes: stat.notes ?? null,
    })),
    p_finished_at: agora(),
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível encerrar a partida agora.');
  }

  // A RPC devolve só a partida; o custo do campo vem da leitura completa.
  return await buscarPartidaPorId(input.matchId);
}

/** Soft delete: o histórico e as estatísticas não somem do ranking. */
export async function apagarPartida(matchId: string, actorUserId: string): Promise<void> {
  const { error } = await cliente()
    .from('matches')
    .update({
      deleted_at: agora(),
      deleted_by: actorUserId,
      // `canceled` junto com `deleted_at`, como o Firestore sempre fez. As
      // listas da tela ("Em aberto", "Próximas") filtram por status, não por
      // `deletedAt` — marcar só a exclusão deixava a partida apagada aparecendo
      // como agendada, e só a tela de detalhe sabia que ela não existia mais.
      status: 'canceled',
      updated_at: agora(),
    })
    .eq('id', matchId);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível apagar a partida agora.');
  }
}

export async function definirMvpManual(
  matchId: string,
  playerId: string | null,
  actorUserId: string,
): Promise<Match> {
  return await atualizarPartida(matchId, {
    manual_mvp_player_id: playerId,
    // Sem MVP manual, quem escolheu e quando também saem: deixar o rastro de
    // uma escolha desfeita confundiria a tela.
    manual_mvp_selected_by: playerId ? actorUserId : null,
    manual_mvp_selected_at: playerId ? agora() : null,
  });
}

// ── Custo do campo ─────────────────────────────────────────────────────────

export async function salvarCustoDoCampo(input: {
  matchId: string;
  /** Em reais, como o domínio usa. Convertido para centavos aqui. */
  totalAmount: number;
  splitCount: number;
  amountPerPlayer: number;
  note?: string | null;
  pixKey?: string | null;
  responsibleName?: string | null;
  paidGuestCount?: number;
  payerPlayerIds?: string[];
  exemptPlayerIds?: string[];
  actorUserId: string;
}): Promise<Match> {
  const pagantes = [...new Set(input.payerPlayerIds ?? [])];
  const pagantesSet = new Set(pagantes);

  const { error } = await cliente().rpc('salvar_custo_do_campo', {
    p_match_id: input.matchId,
    p_custo: {
      total_amount_cents: centsFromAmount(input.totalAmount),
      split_count: input.splitCount,
      amount_per_player_cents: centsFromAmount(input.amountPerPlayer),
      note: input.note ?? null,
      pix_key: input.pixKey ?? null,
      responsible_name: input.responsibleName ?? null,
      paid_guest_count: input.paidGuestCount ?? 0,
      updated_by_user_id: input.actorUserId,
    },
    p_participantes: [
      ...pagantes.map((playerId) => ({ player_id: playerId, role: 'payer' })),
      // Quem pagou não pode entrar como isento: seriam dois papéis para a mesma
      // pessoa, e a chave primária recusaria a linha.
      ...[...new Set(input.exemptPlayerIds ?? [])]
        .filter((playerId) => !pagantesSet.has(playerId))
        .map((playerId) => ({ player_id: playerId, role: 'exempt' })),
    ],
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar o custo do campo agora.');
  }

  return await buscarPartidaPorId(input.matchId);
}

/**
 * Tira o valor do campo da partida.
 *
 * Leva os participantes junto: cota que não existe mais não tem como ter
 * pagante, e deixar as linhas para trás faria a próxima leitura remontar um
 * pagamento órfão.
 */
export async function limparCustoDoCampo(matchId: string): Promise<Match> {
  const { error } = await cliente().rpc('limpar_custo_do_campo', {
    p_match_id: matchId,
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível remover o valor do campo agora.');
  }

  return await buscarPartidaPorId(matchId);
}

export { buscarPartidaPorId };

// ── Presença ───────────────────────────────────────────────────────────────

export async function definirPresenca(input: {
  teamId: string;
  matchId: string;
  playerId: string;
  status: string;
  userId?: string | null;
}): Promise<AttendanceRecord> {
  const instante = agora();
  const supabaseClient = cliente();

  // Atualizar e criar são caminhos separados de propósito.
  //
  // O `upsert` mandava a linha inteira, e o trigger `guard_attendance_self_edit`
  // recusa quando um jogador comum mexe em `user_id` ou `created_at` — mesmo
  // sem querer. A linha nasce em `criar_partida` com `user_id` nulo, então o
  // upsert sempre tentava trocar esse campo, e a confirmação de presença
  // morria com "você não tem permissão" para todo mundo que não é admin.
  //
  // No update vai só o que a pessoa pode mudar. O `responded_at` fica de fora
  // porque o próprio trigger cuida dele.
  const { data: atualizada, error: erroDoUpdate } = await supabaseClient
    .from('attendance')
    .update({ status: input.status, updated_at: instante })
    .eq('match_id', input.matchId)
    .eq('player_id', input.playerId)
    .select()
    .maybeSingle();

  if (erroDoUpdate) {
    throw traduzirErroDoPostgres(erroDoUpdate, 'Não foi possível atualizar a presença agora.');
  }

  if (atualizada) {
    return paraPresenca(atualizada);
  }

  // Sem linha ainda: quem convoca é o admin, e aí a inserção completa é
  // permitida. Acontece em partida antiga e em jogador que entrou depois.
  const { data: criada, error: erroDoInsert } = await supabaseClient
    .from('attendance')
    .insert({
      id: idComposto(input.matchId, input.playerId),
      team_id: input.teamId,
      match_id: input.matchId,
      player_id: input.playerId,
      user_id: input.userId ?? null,
      status: input.status,
      responded_at: instante,
      created_at: instante,
      updated_at: instante,
    })
    .select()
    .single();

  if (erroDoInsert) {
    throw traduzirErroDoPostgres(erroDoInsert, 'Não foi possível atualizar a presença agora.');
  }

  return paraPresenca(criada);
}

// ── Escalação ──────────────────────────────────────────────────────────────

export async function salvarEscalacao(input: {
  teamId: string;
  matchId: string;
  formationKey: string;
  starters: unknown[];
  benchPlayerIds: string[];
}): Promise<Lineup> {
  const instante = agora();

  const { data, error } = await cliente()
    .from('lineups')
    .upsert(
      {
        // Uma escalação por partida: `unique (match_id)` garante, e o id
        // derivado mantém o formato dos dois bancos.
        id: input.matchId,
        team_id: input.teamId,
        match_id: input.matchId,
        formation_key: input.formationKey,
        starters: input.starters,
        bench_player_ids: [...new Set(input.benchPlayerIds)],
        created_at: instante,
        updated_at: instante,
      },
      { onConflict: 'match_id' },
    )
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar a escalação agora.');
  }

  return paraEscalacao(data);
}

// ── Estatística avulsa ─────────────────────────────────────────────────────

/**
 * Uma linha só, sem mexer nas outras.
 *
 * Usado quando o admin ajusta a presença de alguém depois do jogo. Diferente do
 * encerramento, aqui não faz sentido substituir o conjunto: só uma pessoa mudou.
 */
export async function salvarEstatistica(input: {
  teamId: string;
  matchId: string;
  playerId: string;
  played: boolean;
  started?: boolean;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
}): Promise<MatchStat> {
  const instante = agora();

  const { data, error } = await cliente()
    .from('match_stats')
    .upsert(
      {
        id: idComposto(input.matchId, input.playerId),
        team_id: input.teamId,
        match_id: input.matchId,
        player_id: input.playerId,
        played: input.played,
        started: input.started ?? false,
        goals: Math.max(0, input.goals ?? 0),
        assists: Math.max(0, input.assists ?? 0),
        yellow_cards: Math.max(0, input.yellowCards ?? 0),
        red_cards: Math.max(0, input.redCards ?? 0),
        created_at: instante,
        updated_at: instante,
      },
      { onConflict: 'match_id,player_id' },
    )
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar a estatística agora.');
  }

  return paraEstatistica(data);
}

export async function apagarEstatistica(matchId: string, playerId: string): Promise<void> {
  const { error } = await cliente()
    .from('match_stats')
    .delete()
    .eq('match_id', matchId)
    .eq('player_id', playerId);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível remover a estatística agora.');
  }
}

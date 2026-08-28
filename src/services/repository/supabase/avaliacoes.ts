/**
 * Voto de MVP, avaliação e critérios no Postgres.
 *
 * Migra junto com partidas por obrigação, não por conveniência: as policies de
 * `mvp_votes` e `player_ratings` validam contra `matches` e `attendance` — só
 * aceitam voto em partida encerrada, de quem confirmou presença. Se a partida
 * vive num banco e o voto no outro, a validação olha dado velho e recusa.
 *
 * É o mesmo problema que já vivemos no Firestore, invertido.
 *
 * Aqui não há checagem de permissão no cliente. Partida encerrada, presença
 * confirmada, voto único, não votar em si mesmo — tudo isso é a RLS e as
 * constraints. Repetir no app criaria um segundo lugar para divergir.
 */

import { supabase } from '@/config/supabase/client';
import { instante } from '@/lib/migracao/mapear-dominio';
import { todasAsLinhas } from '@/services/repository/supabase/paginacao';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';
import type { MvpVote, PlayerRating, TeamRatingCriterion } from '@/types/domain';

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

function texto(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' && valor.length > 0 ? valor : padrao;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}

function numero(valor: unknown, padrao = 0): number {
  const convertido = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(convertido) ? convertido : padrao;
}

/** Id composto, igual ao do Firestore: um voto por pessoa por partida. */
function idDoVoto(matchId: string, voterPlayerId: string) {
  return `${matchId}__${voterPlayerId}`;
}

function idDaAvaliacao(matchId: string, raterPlayerId: string, targetPlayerId: string) {
  return `${matchId}__${raterPlayerId}__${targetPlayerId}`;
}

export function paraVoto(linha: Record<string, unknown>): MvpVote {
  const referencia = agora();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    matchId: texto(linha.match_id),
    voterPlayerId: texto(linha.voter_player_id),
    targetPlayerId: texto(linha.target_player_id),
    createdAt: instante(linha.created_at, referencia),
    updatedAt: instante(linha.updated_at, referencia),
  };
}

export function paraAvaliacao(linha: Record<string, unknown>): PlayerRating {
  const referencia = agora();
  const snapshot = linha.criteria_snapshot;
  const legado = linha.legacy_criteria;

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    matchId: texto(linha.match_id),
    raterPlayerId: texto(linha.rater_player_id),
    targetPlayerId: texto(linha.target_player_id),
    criteriaScores: (linha.criteria_scores ?? {}) as PlayerRating['criteriaScores'],
    criteriaSnapshot: (snapshot ?? {}) as PlayerRating['criteriaSnapshot'],
    // Avaliação antiga usava ids fixos de critério. Devolver `undefined` em vez
    // de objeto vazio deixa a tela distinguir "sem legado" de "legado vazio".
    criteria: (legado ?? undefined) as PlayerRating['criteria'],
    overall: numero(linha.overall),
    createdAt: instante(linha.created_at, referencia),
    updatedAt: instante(linha.updated_at, referencia),
  };
}

export function paraCriterio(linha: Record<string, unknown>): TeamRatingCriterion {
  const referencia = agora();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    label: texto(linha.label, 'Critério'),
    description: textoOuNulo(linha.description),
    type: linha.type === 'negative' ? 'negative' : 'positive',
    weight: numero(linha.weight, 1),
    active: linha.active === true,
    order: numero(linha.order),
    createdAt: instante(linha.created_at, referencia),
    updatedAt: instante(linha.updated_at, referencia),
  };
}

// ── Leitura ────────────────────────────────────────────────────────────────

export interface FatiaDeAvaliacoes {
  mvpVotes: MvpVote[];
  playerRatings: PlayerRating[];
  ratingCriteria: TeamRatingCriterion[];
}

export const AVALIACOES_VAZIAS: FatiaDeAvaliacoes = {
  mvpVotes: [],
  playerRatings: [],
  ratingCriteria: [],
};

export async function buscarAvaliacoes(teamId: string): Promise<FatiaDeAvaliacoes> {
  const supabaseClient = cliente();

  // Paginado: votos e notas crescem a cada jogo, e o PostgREST corta em 1000
  // linhas sem avisar. Foi assim que a presenca sumiu do ranking.
  const [votos, notas, criterios] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabaseClient.from('mvp_votes').select('*').eq('team_id', teamId).order('id').range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabaseClient
        .from('player_ratings')
        .select('*')
        .eq('team_id', teamId)
        .order('id')
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabaseClient
        .from('rating_criteria')
        .select('*')
        .eq('team_id', teamId)
        .order('order')
        .order('id')
        .range(de, ate),
    ),
  ]);

  for (const resposta of [votos, notas, criterios]) {
    if (resposta.error) {
      throw traduzirErroDoPostgres(
        resposta.error,
        'Não foi possível carregar as avaliações agora.',
      );
    }
  }

  return {
    mvpVotes: (votos.data ?? []).map(paraVoto),
    playerRatings: (notas.data ?? []).map(paraAvaliacao),
    ratingCriteria: (criterios.data ?? []).map(paraCriterio),
  };
}

// ── Voto de MVP ────────────────────────────────────────────────────────────

/**
 * Registra o voto.
 *
 * Sem transação e sem leitura prévia: a chave `unique (match_id, voter)` é que
 * garante um voto por pessoa. Ler antes para checar seria justamente o que
 * derrubava o voto no Firestore — a leitura do documento inexistente.
 */
export async function votarNoMvp(input: {
  teamId: string;
  matchId: string;
  voterPlayerId: string;
  targetPlayerId: string;
}): Promise<MvpVote> {
  const instanteAtual = agora();

  const { data, error } = await cliente()
    .from('mvp_votes')
    .insert({
      id: idDoVoto(input.matchId, input.voterPlayerId),
      team_id: input.teamId,
      match_id: input.matchId,
      voter_player_id: input.voterPlayerId,
      target_player_id: input.targetPlayerId,
      created_at: instanteAtual,
      updated_at: instanteAtual,
    })
    .select()
    .single();

  if (error) {
    // Chave duplicada aqui só significa uma coisa, e a mensagem genérica de
    // "já existe" não ajudaria quem tentou votar de novo.
    if (error.code === '23505') {
      throw criarErroDoRepositorio(
        'Seu voto de MVP nesta partida já foi registrado.',
        'already-exists',
      );
    }

    throw traduzirErroDoPostgres(error, 'Não foi possível registrar seu voto agora.');
  }

  return paraVoto(data);
}

/**
 * Recalcula o campeão a partir dos votos.
 *
 * Fica na mesma operação porque agora os dois vivem no mesmo banco — no
 * Firestore isso era uma escrita à parte, best-effort, que falhava para jogador
 * comum e mostrava erro depois do voto ter entrado.
 */
export async function recalcularMvpDaPartida(matchId: string): Promise<void> {
  // A apuração vai por RPC `security definer`, e não por update direto.
  //
  // `matches_write` exige `can_manage_team`. Um jogador comum consegue gravar o
  // voto, mas o update do agregado não casa linha nenhuma — e UPDATE que não
  // casa nada **não dá erro**. O voto entrava e a contagem ficava parada, sem
  // ninguém perceber.
  //
  // É o mesmo bug que já tivemos no Firestore ("voto de jogador comum parava no
  // agregado que só admin podia gravar"), de volta e mais silencioso.
  //
  // A função confere `is_team_member` por dentro e só mexe em
  // `mvp_winner_player_ids` e `mvp_total_votes` — não é uma porta para editar
  // partida.
  const { error } = await cliente().rpc('apurar_mvp_da_partida', {
    p_match_id: matchId,
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível apurar os votos agora.');
  }
}

// ── Avaliação ──────────────────────────────────────────────────────────────

export async function avaliarJogador(input: {
  teamId: string;
  matchId: string;
  raterPlayerId: string;
  targetPlayerId: string;
  criteriaScores: Record<string, number>;
  criteriaSnapshot: Record<string, unknown>;
  overall: number;
}): Promise<PlayerRating> {
  const instanteAtual = agora();

  const { data, error } = await cliente()
    .from('player_ratings')
    .insert({
      id: idDaAvaliacao(input.matchId, input.raterPlayerId, input.targetPlayerId),
      team_id: input.teamId,
      match_id: input.matchId,
      rater_player_id: input.raterPlayerId,
      target_player_id: input.targetPlayerId,
      criteria_scores: input.criteriaScores,
      criteria_snapshot: input.criteriaSnapshot,
      overall: input.overall,
      created_at: instanteAtual,
      updated_at: instanteAtual,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw criarErroDoRepositorio(
        'Você já avaliou esse jogador nesta partida.',
        'already-exists',
      );
    }

    throw traduzirErroDoPostgres(error, 'Não foi possível salvar sua avaliação agora.');
  }

  return paraAvaliacao(data);
}

// ── Critérios ──────────────────────────────────────────────────────────────

export async function criarCriterio(
  teamId: string,
  input: { label: string; description?: string | null; type: string; weight?: number | null; active?: boolean },
  ordem: number,
): Promise<TeamRatingCriterion> {
  const instanteAtual = agora();
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';

  for (let i = 0; i < 20; i += 1) {
    id += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }

  const { data, error } = await cliente()
    .from('rating_criteria')
    .insert({
      id,
      team_id: teamId,
      label: input.label.trim(),
      description: input.description ?? null,
      type: input.type,
      // A coluna tem `check (weight > 0)`: peso zero recusaria a linha.
      weight: input.weight && input.weight > 0 ? input.weight : 1,
      active: input.active ?? true,
      order: ordem,
      created_at: instanteAtual,
      updated_at: instanteAtual,
    })
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível criar o critério agora.');
  }

  return paraCriterio(data);
}

/**
 * Grava os critérios padrão de um time recém-criado.
 *
 * A lista vem de `createDefaultTeamRatingCriteria`, no app — os rótulos e pesos
 * moram lá. Repeti-los dentro da RPC de criar time daria dois lugares para a
 * mesma verdade, e um deles ficaria para trás na primeira mudança.
 */
export async function criarCriteriosPadrao(
  criterios: TeamRatingCriterion[],
): Promise<void> {
  if (criterios.length === 0) {
    return;
  }

  const { error } = await cliente()
    .from('rating_criteria')
    .insert(
      criterios.map((criterio) => ({
        id: criterio.id,
        team_id: criterio.teamId,
        label: criterio.label,
        description: criterio.description ?? null,
        type: criterio.type,
        weight: criterio.weight && criterio.weight > 0 ? criterio.weight : 1,
        active: criterio.active,
        order: criterio.order,
        created_at: criterio.createdAt,
        updated_at: criterio.updatedAt,
      })),
    );

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível criar os critérios do time.');
  }
}

export async function atualizarCriterio(
  criterionId: string,
  mudancas: Record<string, unknown>,
): Promise<TeamRatingCriterion> {
  const { data, error } = await cliente()
    .from('rating_criteria')
    .update({ ...mudancas, updated_at: agora() })
    .eq('id', criterionId)
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar o critério agora.');
  }

  return paraCriterio(data);
}

/**
 * Desativa em vez de apagar.
 *
 * As avaliações antigas guardam a foto dos critérios no momento da nota, mas
 * apagar a linha quebraria a tela de configuração e a contagem de uso.
 */
export async function desativarCriterio(criterionId: string): Promise<void> {
  await atualizarCriterio(criterionId, { active: false });
}

import {
  buildConfirmedIdsByMatch,
  filterMatchesForStats,
  getPlayerManualAdjustments,
  selectEligiblePlayerMatchStats,
  type StatsFilters,
} from '@/lib/stats';
import type { AppSnapshot } from '@/services/repository/types';
import type { Match, MatchStat, Player } from '@/types/domain';

/**
 * Regra oficial de participação (fonte de verdade da leitura):
 * um jogador conta um jogo em uma partida quando TODAS as condições valem:
 *   1. a partida pertence ao time e tem status 'finished' (canceladas e agendadas nunca contam);
 *   2. existe um MatchStat da partida para o jogador com played === true (súmula);
 *   3. a presença do jogador na partida está 'confirmed' no momento da leitura.
 * Gols e assistências vêm do mesmo MatchStat, sob as mesmas condições.
 * O total exibido na ficha é esse cálculo somado ao ajuste manual (player.manualStats),
 * que aparece no detalhamento como um item explícito de origem 'manual'.
 */

export type PlayerStatBreakdownSource = 'match' | 'manual';

export interface PlayerStatBreakdownMatchItem {
  matchId: string;
  date: string;
  time: string;
  opponentName: string;
  scoreboard: Match['scoreboard'];
  matchStatus: Match['status'];
  amount: number;
  source: PlayerStatBreakdownSource;
}

export interface PlayerStatBreakdownMetric {
  total: number;
  computedTotal: number;
  manualAdjustment: number;
  matches: PlayerStatBreakdownMatchItem[];
}

export interface PlayerStatBreakdown {
  playerId: string;
  games: PlayerStatBreakdownMetric;
  goals: PlayerStatBreakdownMetric;
  assists: PlayerStatBreakdownMetric;
}

export type ParticipationInconsistency =
  | 'confirmed-without-stat'
  | 'stat-without-confirmation'
  | 'stats-on-non-finished-match'
  | 'events-without-played'
  | 'duplicate-match-stats'
  | 'duplicate-attendance';

export interface PlayerParticipationAuditRow {
  matchId: string;
  date: string;
  opponentName: string;
  matchStatus: Match['status'];
  confirmed: boolean;
  inLineup: boolean;
  hasStat: boolean;
  played: boolean;
  goals: number;
  assists: number;
  countsAsGame: boolean;
  reason: string;
  inconsistency: ParticipationInconsistency | null;
}

function sortByDateAsc(left: { date: string }, right: { date: string }) {
  return left.date.localeCompare(right.date);
}

function buildMatchItem(
  match: Match,
  amount: number,
): PlayerStatBreakdownMatchItem {
  return {
    matchId: match.id,
    date: match.date,
    time: match.time,
    opponentName: match.opponentName,
    scoreboard: match.scoreboard ?? null,
    matchStatus: match.status,
    amount,
    source: 'match',
  };
}

/**
 * Detalhamento determinístico por partida das métricas da ficha do jogador.
 * Usa exatamente a mesma regra de participação do buildPlayerAggregates:
 * total = soma dos itens de origem 'match' + ajuste manual ('manual').
 * Não acessa Firebase; recebe o snapshot já carregado.
 */
export function buildPlayerStatBreakdown(
  snapshot: AppSnapshot,
  teamId: string,
  playerId: string,
  filters?: StatsFilters,
): PlayerStatBreakdown {
  const matches = filterMatchesForStats(snapshot.matches, teamId, filters);
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const matchIds = new Set(matchById.keys());
  const confirmedIdsByMatch = buildConfirmedIdsByMatch(snapshot, matchIds);
  const player = snapshot.players.find(
    (item) => item.id === playerId && item.teamId === teamId,
  );
  const includeManual =
    (filters?.matchType ?? 'all') === 'all' && (filters?.period ?? 'all') === 'all';
  const manual = includeManual
    ? getPlayerManualAdjustments(player ?? null)
    : getPlayerManualAdjustments(null);

  const eligibleStats = selectEligiblePlayerMatchStats(
    snapshot,
    playerId,
    matchIds,
    confirmedIdsByMatch,
  );

  const gameItems: PlayerStatBreakdownMatchItem[] = [];
  const goalItems: PlayerStatBreakdownMatchItem[] = [];
  const assistItems: PlayerStatBreakdownMatchItem[] = [];

  for (const stat of eligibleStats) {
    const match = matchById.get(stat.matchId);
    if (!match) {
      continue;
    }

    gameItems.push(buildMatchItem(match, 1));

    if (stat.goals > 0) {
      goalItems.push(buildMatchItem(match, stat.goals));
    }

    if (stat.assists > 0) {
      assistItems.push(buildMatchItem(match, stat.assists));
    }
  }

  gameItems.sort(sortByDateAsc);
  goalItems.sort(sortByDateAsc);
  assistItems.sort(sortByDateAsc);

  const computedGames = gameItems.reduce((sum, item) => sum + item.amount, 0);
  const computedGoals = goalItems.reduce((sum, item) => sum + item.amount, 0);
  const computedAssists = assistItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    playerId,
    games: {
      total: computedGames + manual.matches,
      computedTotal: computedGames,
      manualAdjustment: manual.matches,
      matches: gameItems,
    },
    goals: {
      total: computedGoals + manual.goals,
      computedTotal: computedGoals,
      manualAdjustment: manual.goals,
      matches: goalItems,
    },
    assists: {
      total: computedAssists + manual.assists,
      computedTotal: computedAssists,
      manualAdjustment: manual.assists,
      matches: assistItems,
    },
  };
}

/**
 * Auditoria por partida da participação de um jogador. Aponta inconsistências
 * entre presença confirmada e súmula (MatchStat) — as duas fontes que a regra
 * oficial exige em conjunto para contar um jogo.
 */
export function buildPlayerParticipationAudit(
  snapshot: AppSnapshot,
  teamId: string,
  playerId: string,
): PlayerParticipationAuditRow[] {
  const teamMatches = snapshot.matches.filter(
    (match) => match.teamId === teamId && !match.deletedAt,
  );

  const rows = teamMatches.map<PlayerParticipationAuditRow>((match) => {
    const attendanceRecords = snapshot.attendance.filter(
      (item) => item.matchId === match.id && item.playerId === playerId,
    );
    const attendance = attendanceRecords[0];
    const confirmed = attendance?.status === 'confirmed';
    const lineup = snapshot.lineups.find((item) => item.matchId === match.id);
    const inLineup = Boolean(
      lineup &&
        (lineup.starters.some((node) => node.playerId === playerId) ||
          lineup.benchPlayerIds.includes(playerId)),
    );
    const stats = snapshot.matchStats.filter(
      (item) => item.matchId === match.id && item.playerId === playerId,
    );
    const stat = stats[0];
    const played = stat?.played ?? false;
    const isFinished = match.status === 'finished';
    const countsAsGame = isFinished && played && confirmed;

    let reason: string;
    let inconsistency: ParticipationInconsistency | null = null;

    if (attendanceRecords.length > 1) {
      reason = 'Existem múltiplos registros de presença para o jogador nesta partida.';
      inconsistency = 'duplicate-attendance';
    } else if (stats.length > 1) {
      reason = 'Existem múltiplas súmulas para o jogador nesta partida.';
      inconsistency = 'duplicate-match-stats';
    } else if (stat && !played && (stat.goals > 0 || stat.assists > 0)) {
      reason = 'A súmula possui gols ou assistências, mas played está falso.';
      inconsistency = 'events-without-played';
    } else if (match.status === 'canceled') {
      reason = 'Partida cancelada nunca conta jogo.';
      if (stat && played) {
        inconsistency = 'stats-on-non-finished-match';
      }
    } else if (!isFinished) {
      reason = 'Partida ainda não encerrada.';
      if (stat && played) {
        inconsistency = 'stats-on-non-finished-match';
      }
    } else if (countsAsGame) {
      reason = 'Confirmado e presente na súmula (played).';
    } else if (confirmed && !stat) {
      reason =
        'Confirmado, mas sem registro na súmula — aparece na lista da partida e NÃO conta jogo.';
      inconsistency = 'confirmed-without-stat';
    } else if (confirmed && stat && !played) {
      reason = 'Confirmado, mas marcado como não participante na súmula.';
    } else if (!confirmed && stat) {
      reason =
        'Existe súmula, mas a presença não está confirmada — NÃO conta jogo.';
      inconsistency = 'stat-without-confirmation';
    } else {
      reason = 'Sem presença confirmada e sem súmula.';
    }

    return {
      matchId: match.id,
      date: match.date,
      opponentName: match.opponentName,
      matchStatus: match.status,
      confirmed,
      inLineup,
      hasStat: Boolean(stat),
      played,
      goals: stat?.goals ?? 0,
      assists: stat?.assists ?? 0,
      countsAsGame,
      reason,
      inconsistency,
    };
  });

  return rows.sort(sortByDateAsc);
}

export interface StoredVsCalculatedRow {
  playerId: string;
  nickname: string;
  fullName: string;
  storedGames: number;
  calculatedGames: number;
  storedGoals: number;
  calculatedGoals: number;
  storedAssists: number;
  calculatedAssists: number;
  manualGames: number;
  manualGoals: number;
  manualAssists: number;
  inconsistentMatchIds: string[];
}

/**
 * Compara, por jogador, o total exibido na ficha (calculado + ajuste manual)
 * com o total derivado apenas das partidas encerradas. A diferença é sempre o
 * ajuste manual; partidas com inconsistência de fonte são listadas à parte.
 */
export function compareStoredAndCalculatedStats(
  snapshot: AppSnapshot,
  teamId: string,
  players?: Player[],
): StoredVsCalculatedRow[] {
  const targetPlayers =
    players ?? snapshot.players.filter((player) => player.teamId === teamId);

  return targetPlayers.map((player) => {
    const breakdown = buildPlayerStatBreakdown(snapshot, teamId, player.id);
    const audit = buildPlayerParticipationAudit(snapshot, teamId, player.id);
    const inconsistentMatchIds = audit
      .filter((row) => row.inconsistency !== null)
      .map((row) => row.matchId);

    return {
      playerId: player.id,
      nickname: player.nickname,
      fullName: player.fullName,
      storedGames: breakdown.games.total,
      calculatedGames: breakdown.games.computedTotal,
      storedGoals: breakdown.goals.total,
      calculatedGoals: breakdown.goals.computedTotal,
      storedAssists: breakdown.assists.total,
      calculatedAssists: breakdown.assists.computedTotal,
      manualGames: breakdown.games.manualAdjustment,
      manualGoals: breakdown.goals.manualAdjustment,
      manualAssists: breakdown.assists.manualAdjustment,
      inconsistentMatchIds,
    };
  });
}

/**
 * Reconstrução determinística: aplica a regra oficial sobre as partidas e
 * devolve os MatchStats elegíveis por jogador. Rodar duas vezes sobre o mesmo
 * snapshot produz sempre o mesmo resultado (não há estado interno).
 */
export function calculatePlayerStatsFromMatches(
  snapshot: AppSnapshot,
  teamId: string,
  playerId: string,
  filters?: StatsFilters,
): { games: number; goals: number; assists: number; stats: MatchStat[] } {
  const matches = filterMatchesForStats(snapshot.matches, teamId, filters);
  const matchIds = new Set(matches.map((match) => match.id));
  const confirmedIdsByMatch = buildConfirmedIdsByMatch(snapshot, matchIds);
  const stats = selectEligiblePlayerMatchStats(
    snapshot,
    playerId,
    matchIds,
    confirmedIdsByMatch,
  );

  return {
    games: stats.length,
    goals: stats.reduce((sum, item) => sum + item.goals, 0),
    assists: stats.reduce((sum, item) => sum + item.assists, 0),
    stats,
  };
}

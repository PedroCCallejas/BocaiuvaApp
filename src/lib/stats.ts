import {
  MAX_RATING_SCORE,
  normalizePlayerRatingForDisplay,
  resolveCriterionDisplaySnapshotItem,
} from '@/lib/rating-criteria';
import { normalizeManualStats } from '@/lib/team';
import type { AppSnapshot } from '@/services/repository/types';
import type {
  Match,
  MatchType,
  MvpVote,
  Player,
  PlayerRating,
  PlayerRatingCriteriaSnapshotItem,
  RatingCriterion,
  TeamRatingCriterion,
} from '@/types/domain';

export type StatsPeriodPreset =
  | 'all'
  | 'current-year'
  | 'year'
  | 'current-month'
  | 'month';

export type StatsPlayerScope = 'active' | 'with-history' | 'all';

export type StatsSortMetric =
  | 'goals'
  | 'assists'
  | 'goalParticipations'
  | 'goalsPerGame'
  | 'assistsPerGame'
  | 'participationsPerGame'
  | 'avgRating'
  | 'mvpAwards'
  | 'mvpVotesReceived'
  | 'games'
  | 'presences'
  | `criterion:${string}`;

export type PlayerStatsMetric =
  | 'games'
  | 'goals'
  | 'assists'
  | 'goalParticipations'
  | 'goalsPerGame'
  | 'assistsPerGame'
  | 'participationsPerGame'
  | 'avgRating'
  | 'mvpAwards'
  | 'mvpVotesReceived'
  | 'presences';

export const PLAYER_STATS_LABELS = {
  games: 'Jogos',
  goals: 'Gols',
  assists: 'Assistências',
  goalParticipations: 'Participações em gol',
  goalsPerGame: 'Média de gols',
  assistsPerGame: 'Média de assistências',
  participationsPerGame: 'Média de participações em gol',
  avgRating: 'Média',
  overallRating: 'Nota geral',
  mvpAwards: 'MVPs',
  mvpVotesReceived: 'Votos de MVP',
  presences: 'Presenças',
} as const;

export interface StatsFilters {
  matchType?: MatchType | 'all';
  period?: StatsPeriodPreset;
  year?: number;
  month?: number;
  playerScope?: StatsPlayerScope;
  minGames?: number;
}

export interface MatchMvpBreakdownItem {
  playerId: string;
  votes: number;
  percentage: number;
  awardPoints: number;
  isLeader: boolean;
}

export interface MatchMvpBreakdown {
  totalVotes: number;
  playersWithVotesCount: number;
  winnerPlayerIds: string[];
  hasTie: boolean;
  awardPointsEach: number;
  awardPointsByPlayerId: Record<string, number>;
  results: MatchMvpBreakdownItem[];
}

export interface PlayerAggregateStats {
  player: Player;
  games: number;
  presences: number;
  absences: number;
  goals: number;
  assists: number;
  goalParticipations: number;
  goalsPerGame: number;
  assistsPerGame: number;
  participationsPerGame: number;
  noGoalMatches: number;
  noAssistMatches: number;
  blankMatches: number;
  mvpVotesReceived: number;
  mvpAwards: number;
  mvps: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  avgRating: number;
  totalRatingsReceived: number;
  criteriaAverages: Record<RatingCriterion, number>;
  criteriaAdjustedAverages: Record<RatingCriterion, number>;
  criteriaRatingCounts: Record<RatingCriterion, number>;
  criteriaSnapshotById: Record<RatingCriterion, PlayerRatingCriteriaSnapshotItem>;
  hasHistory: boolean;
  isActive: boolean;
}

export interface TeamAggregateStats {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  pointsRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  goalsPerGame: number;
  topScorerId?: string;
  assistLeaderId?: string;
  attendanceLeaderId?: string;
  mvpLeaderId?: string;
  bestRatedId?: string;
}

export interface RatingSummary {
  overallAverage: number;
  totalRatings: number;
  criteriaAverages: Record<RatingCriterion, number>;
  criteriaAdjustedAverages: Record<RatingCriterion, number>;
  criteriaCounts: Record<RatingCriterion, number>;
  criteriaSnapshotById: Record<RatingCriterion, PlayerRatingCriteriaSnapshotItem>;
}

function average(numbers: number[]) {
  if (numbers.length === 0) {
    return 0;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function formatStatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(digits).replace(/\.?0+$/, '');
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export function isCriterionMetric(metric: StatsSortMetric): metric is `criterion:${string}` {
  return metric.startsWith('criterion:');
}

export function getCriterionIdFromMetric(metric: StatsSortMetric) {
  return isCriterionMetric(metric) ? metric.slice('criterion:'.length) : null;
}

function adjustCriterionScore(
  value: number,
  criterionType: PlayerRatingCriteriaSnapshotItem['type'],
) {
  return criterionType === 'negative' ? MAX_RATING_SCORE + 1 - value : value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getDateParts(date: string) {
  const [year, month] = date.split('-').map((value) => Number(value));
  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
  };
}

function currentDateParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

export function isDateWithinStatsPeriod(
  date: string,
  filters?: Pick<StatsFilters, 'period' | 'year' | 'month'>,
) {
  const period = filters?.period ?? 'all';
  const { year, month } = getDateParts(date);
  const today = currentDateParts();

  switch (period) {
    case 'current-year':
      return year === today.year;
    case 'year':
      return year === (filters?.year ?? today.year);
    case 'current-month':
      return year === today.year && month === today.month;
    case 'month':
      return year === (filters?.year ?? today.year) && month === (filters?.month ?? today.month);
    case 'all':
    default:
      return true;
  }
}

function normalizeFilters(filters?: StatsFilters) {
  return {
    matchType: filters?.matchType ?? 'all',
    period: filters?.period ?? 'all',
    year: filters?.year,
    month: filters?.month,
    playerScope: filters?.playerScope ?? 'with-history',
    minGames: filters?.minGames ?? 0,
  } satisfies Required<Pick<StatsFilters, 'matchType' | 'period' | 'playerScope' | 'minGames'>> &
    Pick<StatsFilters, 'year' | 'month'>;
}

function shouldIncludeManualStats(filters?: StatsFilters) {
  const normalizedFilters = normalizeFilters(filters);
  return normalizedFilters.matchType === 'all' && normalizedFilters.period === 'all';
}

function isPlayerActive(player: Player) {
  return player.status !== 'inactive' && !player.deletedAt;
}

export function filterMatchesByPeriod(matches: Match[], filters?: StatsFilters) {
  const normalizedFilters = normalizeFilters(filters);
  if (normalizedFilters.period === 'all') {
    return matches;
  }

  return matches.filter((match) => {
    return isDateWithinStatsPeriod(match.date, normalizedFilters);
  });
}

export function filterMatchesForStats(
  matches: Match[],
  teamId: string,
  filters?: StatsFilters,
) {
  const normalizedFilters = normalizeFilters(filters);

  return filterMatchesByPeriod(
    matches.filter((match) => {
      if (match.teamId !== teamId || match.status !== 'finished') {
        return false;
      }

      if (normalizedFilters.matchType === 'all') {
        return true;
      }

      return match.matchType === normalizedFilters.matchType;
    }),
    normalizedFilters,
  );
}

function buildConfirmedIdsByMatch(snapshot: AppSnapshot, matchIds: Set<string>) {
  return snapshot.attendance.reduce<Record<string, Set<string>>>((acc, item) => {
    if (!matchIds.has(item.matchId) || item.status !== 'confirmed') {
      return acc;
    }

    acc[item.matchId] = acc[item.matchId] ?? new Set<string>();
    acc[item.matchId].add(item.playerId);
    return acc;
  }, {});
}

export function calculateMatchMvpBreakdown(input: {
  votes: Array<Pick<MvpVote, 'targetPlayerId'>>;
}) {
  const counts = input.votes.reduce<Record<string, number>>((acc, vote) => {
    acc[vote.targetPlayerId] = (acc[vote.targetPlayerId] ?? 0) + 1;
    return acc;
  }, {});

  const results = Object.entries(counts)
    .map(([playerId, votes]) => ({ playerId, votes }))
    .sort((left, right) => {
      if (right.votes !== left.votes) {
        return right.votes - left.votes;
      }

      return left.playerId.localeCompare(right.playerId);
    });
  const topVotes = results[0]?.votes ?? 0;
  const winnerPlayerIds = results
    .filter((item) => item.votes === topVotes && topVotes > 0)
    .map((item) => item.playerId);
  const awardPointsEach = winnerPlayerIds.length > 0 ? 1 / winnerPlayerIds.length : 0;
  const awardPointsByPlayerId = winnerPlayerIds.reduce<Record<string, number>>(
    (acc, playerId) => {
      acc[playerId] = awardPointsEach;
      return acc;
    },
    {},
  );
  const totalVotes = input.votes.length;

  return {
    totalVotes,
    playersWithVotesCount: results.length,
    winnerPlayerIds,
    hasTie: winnerPlayerIds.length > 1,
    awardPointsEach,
    awardPointsByPlayerId,
    results: results.map((item) => ({
      playerId: item.playerId,
      votes: item.votes,
      percentage: totalVotes > 0 ? round((item.votes / totalVotes) * 100, 1) : 0,
      awardPoints: round(awardPointsByPlayerId[item.playerId] ?? 0, 4),
      isLeader: winnerPlayerIds.includes(item.playerId),
    })),
  } satisfies MatchMvpBreakdown;
}

export function buildMatchMvpBreakdown(snapshot: AppSnapshot, matchId: string) {
  const eligiblePlayerIds = new Set(
    snapshot.attendance
      .filter((item) => item.matchId === matchId && item.status === 'confirmed')
      .map((item) => item.playerId),
  );
  const votes = snapshot.mvpVotes.filter(
    (vote) =>
      vote.matchId === matchId &&
      eligiblePlayerIds.has(vote.voterPlayerId) &&
      eligiblePlayerIds.has(vote.targetPlayerId),
  );

  return calculateMatchMvpBreakdown({ votes });
}

export function buildRatingSummary(
  ratings: PlayerRating[],
  currentCriteria?: TeamRatingCriterion[],
) {
  const validOverall = ratings
    .map((item) => normalizePlayerRatingForDisplay(item, currentCriteria).overall)
    .filter(isFiniteNumber);
  const criteriaValues = new Map<
    string,
    {
      rawValues: number[];
      adjustedValues: number[];
      snapshot: PlayerRatingCriteriaSnapshotItem;
    }
  >();

  for (const rating of ratings) {
    const normalizedRating = normalizePlayerRatingForDisplay(rating, currentCriteria);

    for (const [criterionId, value] of Object.entries(normalizedRating.criteriaScores)) {
      if (!isFiniteNumber(value)) {
        continue;
      }

      const resolved = resolveCriterionDisplaySnapshotItem({
        criterionId,
        criterionSnapshot: normalizedRating.criteriaSnapshot[criterionId],
        currentCriteria,
      });
      const currentBucket = criteriaValues.get(resolved.displayKey) ?? {
        rawValues: [],
        adjustedValues: [],
        snapshot: resolved.snapshot,
      };

      currentBucket.rawValues.push(value);
      currentBucket.adjustedValues.push(
        adjustCriterionScore(value, resolved.snapshot.type),
      );
      currentBucket.snapshot = resolved.snapshot;
      criteriaValues.set(resolved.displayKey, currentBucket);
    }
  }

  const criteriaAverages = [...criteriaValues.entries()].reduce<Record<RatingCriterion, number>>(
    (acc, [criterionId, bucket]) => {
      acc[criterionId] = round(average(bucket.rawValues), 1);
      return acc;
    },
    {},
  );
  const criteriaAdjustedAverages = [...criteriaValues.entries()].reduce<
    Record<RatingCriterion, number>
  >((acc, [criterionId, bucket]) => {
    acc[criterionId] = round(average(bucket.adjustedValues), 1);
    return acc;
  }, {});
  const criteriaCounts = [...criteriaValues.entries()].reduce<Record<RatingCriterion, number>>(
    (acc, [criterionId, bucket]) => {
      acc[criterionId] = bucket.rawValues.length;
      return acc;
    },
    {},
  );
  const criteriaSnapshotById = [...criteriaValues.entries()].reduce<
    Record<RatingCriterion, PlayerRatingCriteriaSnapshotItem>
  >((acc, [criterionId, bucket]) => {
    acc[criterionId] = bucket.snapshot;
    return acc;
  }, {});

  return {
    overallAverage: round(average(validOverall), 1),
    totalRatings: validOverall.length,
    criteriaAverages,
    criteriaAdjustedAverages,
    criteriaCounts,
    criteriaSnapshotById,
  } satisfies RatingSummary;
}

export function buildPlayerAggregates(
  snapshot: AppSnapshot,
  teamId: string,
  filters?: StatsFilters,
) {
  const normalizedFilters = normalizeFilters(filters);
  const includeManualStats = shouldIncludeManualStats(normalizedFilters);
  const players = snapshot.players.filter((player) => player.teamId === teamId);
  const matches = filterMatchesForStats(snapshot.matches, teamId, normalizedFilters);
  const matchIds = new Set(matches.map((match) => match.id));
  const confirmedIdsByMatch = buildConfirmedIdsByMatch(snapshot, matchIds);
  const votesByMatch = snapshot.mvpVotes.reduce<Record<string, MvpVote[]>>((acc, vote) => {
    if (!matchIds.has(vote.matchId)) {
      return acc;
    }

    acc[vote.matchId] = [...(acc[vote.matchId] ?? []), vote];
    return acc;
  }, {});
  const mvpStatsByPlayerId = matches.reduce<
    Record<string, { votesReceived: number; awards: number }>
  >((acc, match) => {
    const confirmedPlayers = confirmedIdsByMatch[match.id] ?? new Set<string>();
    const validVotes = (votesByMatch[match.id] ?? []).filter(
      (vote) =>
        confirmedPlayers.has(vote.voterPlayerId) &&
        confirmedPlayers.has(vote.targetPlayerId),
    );
    const breakdown = calculateMatchMvpBreakdown({ votes: validVotes });

    for (const result of breakdown.results) {
      const current = acc[result.playerId] ?? { votesReceived: 0, awards: 0 };
      current.votesReceived += result.votes;
      current.awards += result.awardPoints;
      acc[result.playerId] = current;
    }

    return acc;
  }, {});

  return players.flatMap<PlayerAggregateStats>((player) => {
    const normalizedManualStats = normalizeManualStats(player.manualStats);
    const manualStats = includeManualStats
      ? normalizedManualStats
      : {
          matches: 0,
          goals: 0,
          assists: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          mvps: 0,
        };
    const playerAttendance = snapshot.attendance.filter(
      (item) => item.playerId === player.id && matchIds.has(item.matchId),
    );
    const playerStats = snapshot.matchStats.filter(
      (item) =>
        item.playerId === player.id &&
        matchIds.has(item.matchId) &&
        item.played &&
        confirmedIdsByMatch[item.matchId]?.has(player.id),
    );
    const playerRatings = snapshot.playerRatings.filter(
      (item) =>
        item.targetPlayerId === player.id &&
        matchIds.has(item.matchId) &&
        confirmedIdsByMatch[item.matchId]?.has(item.targetPlayerId) &&
        confirmedIdsByMatch[item.matchId]?.has(item.raterPlayerId),
    );
    const ratingSummary = buildRatingSummary(playerRatings, snapshot.ratingCriteria);
    const mvpStats = mvpStatsByPlayerId[player.id] ?? {
      votesReceived: 0,
      awards: 0,
    };
    const hasManualHistory = Object.values(normalizedManualStats).some((value) => value > 0);
    const hasFilteredHistory =
      playerAttendance.length > 0 ||
      playerStats.length > 0 ||
      ratingSummary.totalRatings > 0 ||
      mvpStats.votesReceived > 0 ||
      mvpStats.awards > 0;
    const isActive = isPlayerActive(player);

    if (normalizedFilters.playerScope === 'active' && !isActive) {
      return [];
    }

    if (
      normalizedFilters.playerScope === 'with-history' &&
      !isActive &&
      !hasManualHistory &&
      !hasFilteredHistory
    ) {
      return [];
    }

    const realGames = playerStats.length;
    const realGoals = playerStats.reduce((sum, item) => sum + item.goals, 0);
    const realAssists = playerStats.reduce((sum, item) => sum + item.assists, 0);
    const realWins = playerStats.filter((item) => {
      const match = matches.find((entry) => entry.id === item.matchId);
      return match?.scoreboard?.result === 'win';
    }).length;
    const realDraws = playerStats.filter((item) => {
      const match = matches.find((entry) => entry.id === item.matchId);
      return match?.scoreboard?.result === 'draw';
    }).length;
    const realLosses = playerStats.filter((item) => {
      const match = matches.find((entry) => entry.id === item.matchId);
      return match?.scoreboard?.result === 'loss';
    }).length;
    const games = manualStats.matches + realGames;
    const goals = manualStats.goals + realGoals;
    const assists = manualStats.assists + realAssists;
    const wins = manualStats.wins + realWins;
    const draws = manualStats.draws + realDraws;
    const losses = manualStats.losses + realLosses;
    const mvpAwards = round(manualStats.mvps + mvpStats.awards, 2);

    return [{
      player,
      games,
      presences:
        manualStats.matches +
        playerAttendance.filter((item) => item.status === 'confirmed').length,
      absences: playerAttendance.filter((item) => item.status === 'absent').length,
      goals,
      assists,
      goalParticipations: goals + assists,
      goalsPerGame: round(goals / Math.max(games, 1), 2),
      assistsPerGame: round(assists / Math.max(games, 1), 2),
      participationsPerGame: round((goals + assists) / Math.max(games, 1), 2),
      noGoalMatches: playerStats.filter((item) => item.goals === 0).length,
      noAssistMatches: playerStats.filter((item) => item.assists === 0).length,
      blankMatches: playerStats.filter((item) => item.goals + item.assists === 0).length,
      mvpVotesReceived: mvpStats.votesReceived,
      mvpAwards,
      mvps: mvpAwards,
      wins,
      draws,
      losses,
      winRate: round(((wins * 3 + draws) / Math.max(games * 3, 1)) * 100, 1),
      avgRating: ratingSummary.overallAverage,
      totalRatingsReceived: ratingSummary.totalRatings,
      criteriaAverages: ratingSummary.criteriaAverages,
      criteriaAdjustedAverages: ratingSummary.criteriaAdjustedAverages,
      criteriaRatingCounts: ratingSummary.criteriaCounts,
      criteriaSnapshotById: ratingSummary.criteriaSnapshotById,
      hasHistory: hasManualHistory || hasFilteredHistory,
      isActive,
    }];
  });
}

export function applyPlayerStatsFilters(
  playerStats: PlayerAggregateStats[],
  filters?: Pick<StatsFilters, 'minGames'>,
) {
  const minGames = filters?.minGames ?? 0;
  return playerStats.filter((item) => item.games >= minGames);
}

export function getPlayerAggregateMetricValue(
  item: PlayerAggregateStats,
  metric: PlayerStatsMetric,
) {
  switch (metric) {
    case 'assists':
      return item.assists;
    case 'goalParticipations':
      return item.goalParticipations;
    case 'goalsPerGame':
      return item.goalsPerGame;
    case 'assistsPerGame':
      return item.assistsPerGame;
    case 'participationsPerGame':
      return item.participationsPerGame;
    case 'avgRating':
      return item.avgRating;
    case 'mvpAwards':
      return item.mvpAwards;
    case 'mvpVotesReceived':
      return item.mvpVotesReceived;
    case 'games':
      return item.games;
    case 'presences':
      return item.presences;
    case 'goals':
    default:
      return item.goals;
  }
}

export function formatPlayerMetricValue(
  metric: PlayerStatsMetric,
  value: number,
) {
  switch (metric) {
    case 'avgRating':
      return formatStatNumber(value, 1);
    case 'goalsPerGame':
    case 'assistsPerGame':
    case 'participationsPerGame':
    case 'mvpAwards':
      return formatStatNumber(value, 2);
    default:
      return formatStatNumber(value, 0);
  }
}

export function buildPlayerMetricSubtitle(
  metric: StatsSortMetric,
  item: PlayerAggregateStats,
) {
  const criterionId = getCriterionIdFromMetric(metric);

  if (criterionId) {
    const snapshot = item.criteriaSnapshotById[criterionId];
    const count = item.criteriaRatingCounts[criterionId] ?? 0;
    const rawAverage = item.criteriaAverages[criterionId] ?? 0;

    return snapshot
      ? `${count} avaliação(ões) - ${
          snapshot.type === 'negative'
            ? `média bruta ${formatStatNumber(rawAverage, 1)}`
            : 'quanto maior, melhor'
        }`
      : `${count} avaliação(ões)`;
  }

  switch (metric) {
    case 'goals':
      return `${formatPlayerMetricValue('games', item.games)} jogo(s) - ${PLAYER_STATS_LABELS.goalsPerGame} ${formatPlayerMetricValue('goalsPerGame', item.goalsPerGame)}`;
    case 'assists':
      return `${formatPlayerMetricValue('games', item.games)} jogo(s) - ${PLAYER_STATS_LABELS.assistsPerGame} ${formatPlayerMetricValue('assistsPerGame', item.assistsPerGame)}`;
    case 'goalParticipations':
      return `${formatPlayerMetricValue('goals', item.goals)} ${PLAYER_STATS_LABELS.goals.toLowerCase()} + ${formatPlayerMetricValue('assists', item.assists)} ${PLAYER_STATS_LABELS.assists.toLowerCase()}`;
    case 'participationsPerGame':
      return `${formatPlayerMetricValue('games', item.games)} jogo(s) - ${PLAYER_STATS_LABELS.participationsPerGame} ${formatPlayerMetricValue('participationsPerGame', item.participationsPerGame)}`;
    case 'avgRating':
      return `${formatStatNumber(item.totalRatingsReceived, 0)} avaliação(ões)`;
    case 'mvpAwards':
      return `${formatPlayerMetricValue('mvpVotesReceived', item.mvpVotesReceived)} voto(s) recebidos`;
    case 'mvpVotesReceived':
      return `${formatPlayerMetricValue('mvpAwards', item.mvpAwards)} ${PLAYER_STATS_LABELS.mvpAwards}`;
    case 'games':
      return `${formatPlayerMetricValue('presences', item.presences)} presenças confirmadas`;
    case 'presences':
      return `${formatPlayerMetricValue('games', item.games)} jogo(s)`;
    default:
      return `${formatPlayerMetricValue('games', item.games)} jogo(s)`;
  }
}

export function buildPlayerStatsLabel(item: PlayerAggregateStats) {
  return `${formatPlayerMetricValue('goals', item.goals)} ${PLAYER_STATS_LABELS.goals.toLowerCase()} - ${formatPlayerMetricValue('assists', item.assists)} ${PLAYER_STATS_LABELS.assists.toLowerCase()} - ${formatPlayerMetricValue('mvpAwards', item.mvpAwards)} ${PLAYER_STATS_LABELS.mvpAwards}`;
}

export function buildPlayerProfileMetricCards(item: PlayerAggregateStats) {
  return [
    {
      label: PLAYER_STATS_LABELS.games,
      value: formatPlayerMetricValue('games', item.games),
      helper: 'Total',
    },
    {
      label: PLAYER_STATS_LABELS.goals,
      value: formatPlayerMetricValue('goals', item.goals),
      helper: 'Marcados',
    },
    {
      label: PLAYER_STATS_LABELS.assists,
      value: formatPlayerMetricValue('assists', item.assists),
      helper: 'Distribuídas',
    },
    {
      label: PLAYER_STATS_LABELS.goalParticipations,
      value: formatPlayerMetricValue('goalParticipations', item.goalParticipations),
      helper: `${PLAYER_STATS_LABELS.goals} + ${PLAYER_STATS_LABELS.assists}`,
    },
    {
      label: PLAYER_STATS_LABELS.overallRating,
      value: formatPlayerMetricValue('avgRating', item.avgRating),
      helper: `${formatStatNumber(item.totalRatingsReceived, 0)} avaliação(ões)`,
    },
    {
      label: PLAYER_STATS_LABELS.mvpAwards,
      value: formatPlayerMetricValue('mvpAwards', item.mvpAwards),
      helper: `${formatPlayerMetricValue('mvpVotesReceived', item.mvpVotesReceived)} voto(s) recebidos`,
    },
  ];
}

export function calculateRankingMetric(
  item: PlayerAggregateStats,
  metric: StatsSortMetric,
) {
  const criterionId = getCriterionIdFromMetric(metric);

  if (criterionId) {
    return item.criteriaAdjustedAverages[criterionId] ?? 0;
  }

  return getPlayerAggregateMetricValue(item, metric as PlayerStatsMetric);
}

export function sortPlayerAggregatesByMetric(
  playerStats: PlayerAggregateStats[],
  metric: StatsSortMetric,
) {
  return [...playerStats].sort((left, right) => {
    const valueDiff =
      calculateRankingMetric(right, metric) - calculateRankingMetric(left, metric);
    if (valueDiff !== 0) {
      return valueDiff;
    }

    if (right.games !== left.games) {
      return right.games - left.games;
    }

    return left.player.nickname.localeCompare(right.player.nickname);
  });
}

export function buildCriterionSortMetric(criterionId: string): StatsSortMetric {
  return `criterion:${criterionId}`;
}

export function getCriteriaSummaryEntries(summary: Pick<
  RatingSummary,
  'criteriaAverages' | 'criteriaAdjustedAverages' | 'criteriaCounts' | 'criteriaSnapshotById'
>) {
  return Object.entries(summary.criteriaSnapshotById)
    .map(([criterionId, snapshot]) => ({
      criterionId,
      label: snapshot.label,
      type: snapshot.type,
      weight: snapshot.weight,
      order: snapshot.order,
      average: summary.criteriaAverages[criterionId] ?? 0,
      adjustedAverage: summary.criteriaAdjustedAverages[criterionId] ?? 0,
      count: summary.criteriaCounts[criterionId] ?? 0,
    }))
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.label.localeCompare(right.label);
    });
}

export function buildRankingByMetric(
  playerStats: PlayerAggregateStats[],
  metric: StatsSortMetric,
  options?: {
    limit?: number;
    minGames?: number;
  },
) {
  const filtered = applyPlayerStatsFilters(playerStats, {
    minGames: options?.minGames ?? 0,
  });
  const sorted = sortPlayerAggregatesByMetric(filtered, metric);

  if (!options?.limit || options.limit <= 0) {
    return sorted;
  }

  return sorted.slice(0, options.limit);
}

export function buildTeamAggregates(
  snapshot: AppSnapshot,
  teamId: string,
  filters?: StatsFilters,
) {
  const matches = filterMatchesForStats(snapshot.matches, teamId, filters);
  const playerStats = buildPlayerAggregates(snapshot, teamId, {
    ...filters,
    playerScope: 'all',
  });
  const teamPlayerStats = applyPlayerStatsFilters(playerStats);
  const wins = matches.filter((match) => match.scoreboard?.result === 'win').length;
  const draws = matches.filter((match) => match.scoreboard?.result === 'draw').length;
  const losses = matches.filter((match) => match.scoreboard?.result === 'loss').length;
  const goalsFor = matches.reduce(
    (sum, match) => sum + (match.scoreboard?.team ?? 0),
    0,
  );
  const goalsAgainst = matches.reduce(
    (sum, match) => sum + (match.scoreboard?.opponent ?? 0),
    0,
  );
  const totalMatches = Math.max(
    matches.length,
    ...teamPlayerStats.map((item) => item.wins + item.draws + item.losses),
    0,
  );
  const totalWins = Math.max(wins, ...teamPlayerStats.map((item) => item.wins), 0);
  const totalDraws = Math.max(draws, ...teamPlayerStats.map((item) => item.draws), 0);
  const totalLosses = Math.max(losses, ...teamPlayerStats.map((item) => item.losses), 0);

  const byGoals = sortPlayerAggregatesByMetric(teamPlayerStats, 'goals');
  const byAssists = sortPlayerAggregatesByMetric(teamPlayerStats, 'assists');
  const byPresence = sortPlayerAggregatesByMetric(teamPlayerStats, 'presences');
  const byMvp = sortPlayerAggregatesByMetric(teamPlayerStats, 'mvpAwards');
  const byRating = sortPlayerAggregatesByMetric(teamPlayerStats, 'avgRating');

  return {
    totalMatches,
    wins: totalWins,
    draws: totalDraws,
    losses: totalLosses,
    pointsRate: round(
      ((totalWins * 3 + totalDraws) / Math.max(totalMatches * 3, 1)) * 100,
      1,
    ),
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    goalsPerGame: round(goalsFor / Math.max(totalMatches, 1), 2),
    topScorerId: byGoals[0]?.player.id,
    assistLeaderId: byAssists[0]?.player.id,
    attendanceLeaderId: byPresence[0]?.player.id,
    mvpLeaderId: byMvp[0]?.player.id,
    bestRatedId: byRating[0]?.player.id,
  } satisfies TeamAggregateStats;
}

export function getAvailableStatsYears(matches: Match[]) {
  return [...new Set(matches.map((match) => getDateParts(match.date).year))]
    .filter((year) => year > 0)
    .sort((left, right) => right - left);
}

export function getAvailableStatsMonths(matches: Match[], year: number) {
  return [...new Set(
    matches
      .filter((match) => getDateParts(match.date).year === year)
      .map((match) => getDateParts(match.date).month),
  )]
    .filter((month) => month > 0)
    .sort((left, right) => left - right);
}

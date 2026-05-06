import { RATING_CRITERIA_ORDER } from '@/constants/options';
import { getMvpSummary } from '@/lib/match';
import { normalizeManualStats } from '@/lib/team';
import type { MatchType, Player, RatingCriterion } from '@/types/domain';
import type { AppSnapshot } from '@/services/repository/types';

export interface StatsFilters {
  matchType?: MatchType | 'all';
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
  mvps: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  avgRating: number;
  criteriaAverages: Record<RatingCriterion, number>;
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

function average(numbers: number[]) {
  if (numbers.length === 0) {
    return 0;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function matchesForStats(snapshot: AppSnapshot, teamId: string, filters?: StatsFilters) {
  return snapshot.matches.filter((match) => {
    if (match.teamId !== teamId || match.status !== 'finished') {
      return false;
    }

    if (!filters?.matchType || filters.matchType === 'all') {
      return true;
    }

    return match.matchType === filters.matchType;
  });
}

export function buildPlayerAggregates(
  snapshot: AppSnapshot,
  teamId: string,
  filters?: StatsFilters,
) {
  const players = snapshot.players.filter((player) => player.teamId === teamId);
  const matches = matchesForStats(snapshot, teamId, filters);
  const matchIds = new Set(matches.map((match) => match.id));
  const mvpWinsByPlayerId = matches.reduce<Record<string, number>>((acc, match) => {
    const mvpSummary = getMvpSummary(snapshot, match.id);

    for (const winnerPlayerId of mvpSummary.winnerPlayerIds) {
      acc[winnerPlayerId] = (acc[winnerPlayerId] ?? 0) + 1;
    }

    return acc;
  }, {});

  return players.map<PlayerAggregateStats>((player) => {
    const manualStats = normalizeManualStats(player.manualStats);
    const playerAttendance = snapshot.attendance.filter(
      (item) => item.playerId === player.id && matchIds.has(item.matchId),
    );
    const playerStats = snapshot.matchStats.filter(
      (item) => item.playerId === player.id && matchIds.has(item.matchId) && item.played,
    );
    const playerRatings = snapshot.playerRatings.filter(
      (item) => item.targetPlayerId === player.id && matchIds.has(item.matchId),
    );

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

    const criteriaAverages = RATING_CRITERIA_ORDER.reduce<
      Record<RatingCriterion, number>
    >((acc, criterion) => {
      acc[criterion] = Number(
        average(playerRatings.map((item) => item.criteria[criterion])).toFixed(1),
      );
      return acc;
    }, {} as Record<RatingCriterion, number>);

    return {
      player,
      games,
      presences:
        manualStats.matches + playerAttendance.filter((item) => item.status === 'confirmed').length,
      absences: playerAttendance.filter((item) => item.status === 'absent').length,
      goals,
      assists,
      goalParticipations: goals + assists,
      goalsPerGame: Number((goals / Math.max(games, 1)).toFixed(2)),
      assistsPerGame: Number((assists / Math.max(games, 1)).toFixed(2)),
      participationsPerGame: Number(((goals + assists) / Math.max(games, 1)).toFixed(2)),
      noGoalMatches: playerStats.filter((item) => item.goals === 0).length,
      noAssistMatches: playerStats.filter((item) => item.assists === 0).length,
      blankMatches: playerStats.filter((item) => item.goals + item.assists === 0).length,
      mvps: manualStats.mvps + (mvpWinsByPlayerId[player.id] ?? 0),
      wins,
      draws,
      losses,
      winRate: Number((((wins * 3 + draws) / Math.max(games * 3, 1)) * 100).toFixed(1)),
      avgRating: Number(average(playerRatings.map((item) => item.overall)).toFixed(1)),
      criteriaAverages,
    };
  });
}

export function buildTeamAggregates(
  snapshot: AppSnapshot,
  teamId: string,
  filters?: StatsFilters,
) {
  const matches = matchesForStats(snapshot, teamId, filters);
  const playerStats = buildPlayerAggregates(snapshot, teamId, filters);

  const wins = matches.filter((match) => match.scoreboard?.result === 'win').length;
  const draws = matches.filter((match) => match.scoreboard?.result === 'draw').length;
  const losses = matches.filter((match) => match.scoreboard?.result === 'loss').length;
  const goalsFor = playerStats.reduce((sum, item) => sum + item.goals, 0);
  const goalsAgainst = matches.reduce(
    (sum, match) => sum + (match.scoreboard?.opponent ?? 0),
    0,
  );
  const totalMatches = Math.max(
    matches.length,
    ...playerStats.map((item) => item.wins + item.draws + item.losses),
  );
  const totalWins = Math.max(wins, ...playerStats.map((item) => item.wins));
  const totalDraws = Math.max(draws, ...playerStats.map((item) => item.draws));
  const totalLosses = Math.max(losses, ...playerStats.map((item) => item.losses));

  const byGoals = [...playerStats].sort((left, right) => right.goals - left.goals);
  const byAssists = [...playerStats].sort((left, right) => right.assists - left.assists);
  const byPresence = [...playerStats].sort(
    (left, right) => right.presences - left.presences,
  );
  const byMvp = [...playerStats].sort((left, right) => right.mvps - left.mvps);
  const byRating = [...playerStats].sort(
    (left, right) => right.avgRating - left.avgRating,
  );

  return {
    totalMatches,
    wins: totalWins,
    draws: totalDraws,
    losses: totalLosses,
    pointsRate: Number(
      (((totalWins * 3 + totalDraws) / Math.max(totalMatches * 3, 1)) * 100).toFixed(1),
    ),
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    goalsPerGame: Number((goalsFor / Math.max(totalMatches, 1)).toFixed(2)),
    topScorerId: byGoals[0]?.player.id,
    assistLeaderId: byAssists[0]?.player.id,
    attendanceLeaderId: byPresence[0]?.player.id,
    mvpLeaderId: byMvp[0]?.player.id,
    bestRatedId: byRating[0]?.player.id,
  } satisfies TeamAggregateStats;
}

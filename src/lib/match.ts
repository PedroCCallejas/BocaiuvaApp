import { buildMatchMvpBreakdown, buildRatingSummary } from '@/lib/stats';
import type {
  MatchResult,
  Player,
  PlayerRating,
  PlayerRatingCriteriaSnapshotItem,
  RatingCriterion,
} from '@/types/domain';
import type { AppSnapshot } from '@/services/repository/types';

export function calculateMatchResult(teamScore: number, opponentScore: number): MatchResult {
  if (teamScore > opponentScore) {
    return 'win';
  }

  if (teamScore < opponentScore) {
    return 'loss';
  }

  return 'draw';
}

export function getConfirmedAttendance(snapshot: AppSnapshot, matchId: string) {
  return snapshot.attendance.filter(
    (item) => item.matchId === matchId && item.status === 'confirmed',
  );
}

export function getConfirmedPlayerIds(snapshot: AppSnapshot, matchId: string) {
  return getConfirmedAttendance(snapshot, matchId).map((item) => item.playerId);
}

export function getConfirmedPlayers(snapshot: AppSnapshot, matchId: string) {
  const playerIds = new Set(getConfirmedPlayerIds(snapshot, matchId));
  return snapshot.players.filter((player) => playerIds.has(player.id));
}

export function isPlayerConfirmedForMatch(
  snapshot: AppSnapshot,
  matchId: string,
  playerId?: string | null,
) {
  if (!playerId) {
    return false;
  }

  return snapshot.attendance.some(
    (item) =>
      item.matchId === matchId &&
      item.playerId === playerId &&
      item.status === 'confirmed',
  );
}

export interface MvpSummaryItem {
  playerId: string;
  votes: number;
}

export interface MvpSummary {
  totalVotes: number;
  results: MvpSummaryItem[];
  winnerPlayerIds: string[];
}

export function getMvpSummary(snapshot: AppSnapshot, matchId: string): MvpSummary {
  const breakdown = buildMatchMvpBreakdown(snapshot, matchId);

  return {
    totalVotes: breakdown.totalVotes,
    results: breakdown.results.map((item) => ({
      playerId: item.playerId,
      votes: item.votes,
    })),
    winnerPlayerIds: breakdown.winnerPlayerIds,
  };
}

export function hasPlayerVotedMvp(
  snapshot: AppSnapshot,
  matchId: string,
  playerId?: string | null,
) {
  if (!playerId) {
    return false;
  }

  return snapshot.mvpVotes.some(
    (vote) => vote.matchId === matchId && vote.voterPlayerId === playerId,
  );
}

export function hasPlayerRatedTarget(
  snapshot: AppSnapshot,
  matchId: string,
  raterPlayerId: string,
  targetPlayerId: string,
) {
  return Boolean(
    findPlayerRating(snapshot, matchId, raterPlayerId, targetPlayerId),
  );
}

export function findPlayerRating(
  snapshot: AppSnapshot,
  matchId: string,
  raterPlayerId?: string | null,
  targetPlayerId?: string | null,
) {
  if (!raterPlayerId || !targetPlayerId) {
    return null;
  }

  return snapshot.playerRatings.find(
    (rating) =>
      rating.matchId === matchId &&
      rating.raterPlayerId === raterPlayerId &&
      rating.targetPlayerId === targetPlayerId,
  ) ?? null;
}

export interface PlayerRatingSummary {
  playerId: string;
  overallAverage: number;
  totalRatings: number;
  criteriaAverages: Record<RatingCriterion, number>;
  criteriaAdjustedAverages: Record<RatingCriterion, number>;
  criteriaCounts: Record<RatingCriterion, number>;
  criteriaSnapshotById: Record<RatingCriterion, PlayerRatingCriteriaSnapshotItem>;
}

function summarizeRatings(
  ratings: PlayerRating[],
  currentCriteria = [] as AppSnapshot['ratingCriteria'],
): PlayerRatingSummary[] {
  const grouped = ratings.reduce<Record<string, PlayerRating[]>>((acc, rating) => {
    acc[rating.targetPlayerId] = [...(acc[rating.targetPlayerId] ?? []), rating];
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([playerId, playerRatings]) => {
      const summary = buildRatingSummary(playerRatings, currentCriteria);

      return {
        playerId,
        overallAverage: summary.overallAverage,
        totalRatings: summary.totalRatings,
        criteriaAverages: summary.criteriaAverages,
        criteriaAdjustedAverages: summary.criteriaAdjustedAverages,
        criteriaCounts: summary.criteriaCounts,
        criteriaSnapshotById: summary.criteriaSnapshotById,
      };
    })
    .sort((left, right) => right.overallAverage - left.overallAverage);
}

export function getRatingsSummary(snapshot: AppSnapshot, matchId: string) {
  const eligible = new Set(getConfirmedPlayerIds(snapshot, matchId));
  const ratings = snapshot.playerRatings.filter(
    (item) =>
      item.matchId === matchId &&
      eligible.has(item.raterPlayerId) &&
      eligible.has(item.targetPlayerId),
  );

  return summarizeRatings(ratings, snapshot.ratingCriteria);
}

export function findPlayerById(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId) ?? null;
}

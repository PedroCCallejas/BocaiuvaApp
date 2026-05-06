import { RATING_CRITERIA_ORDER } from '@/constants/options';
import type {
  MatchResult,
  Player,
  PlayerRating,
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
  const eligible = new Set(getConfirmedPlayerIds(snapshot, matchId));
  const votes = snapshot.mvpVotes.filter(
    (vote) =>
      vote.matchId === matchId &&
      eligible.has(vote.voterPlayerId) &&
      eligible.has(vote.targetPlayerId),
  );

  const counts = votes.reduce<Record<string, number>>((acc, vote) => {
    acc[vote.targetPlayerId] = (acc[vote.targetPlayerId] ?? 0) + 1;
    return acc;
  }, {});

  const results = Object.entries(counts)
    .map(([playerId, count]) => ({ playerId, votes: count }))
    .sort((left, right) => right.votes - left.votes);
  const topVotes = results[0]?.votes ?? 0;

  return {
    totalVotes: votes.length,
    results,
    winnerPlayerIds: results
      .filter((item) => item.votes === topVotes && topVotes > 0)
      .map((item) => item.playerId),
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
  return snapshot.playerRatings.some(
    (rating) =>
      rating.matchId === matchId &&
      rating.raterPlayerId === raterPlayerId &&
      rating.targetPlayerId === targetPlayerId,
  );
}

export interface PlayerRatingSummary {
  playerId: string;
  overallAverage: number;
  totalRatings: number;
  criteriaAverages: Record<RatingCriterion, number>;
}

function average(numbers: number[]) {
  if (numbers.length === 0) {
    return 0;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function summarizeRatings(ratings: PlayerRating[]): PlayerRatingSummary[] {
  const grouped = ratings.reduce<Record<string, PlayerRating[]>>((acc, rating) => {
    acc[rating.targetPlayerId] = [...(acc[rating.targetPlayerId] ?? []), rating];
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([playerId, playerRatings]) => {
      const criteriaAverages = RATING_CRITERIA_ORDER.reduce<
        Record<RatingCriterion, number>
      >((acc, criterion) => {
        acc[criterion] = Number(
          average(playerRatings.map((item) => item.criteria[criterion])).toFixed(1),
        );
        return acc;
      }, {} as Record<RatingCriterion, number>);

      return {
        playerId,
        overallAverage: Number(
          average(playerRatings.map((item) => item.overall)).toFixed(1),
        ),
        totalRatings: playerRatings.length,
        criteriaAverages,
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

  return summarizeRatings(ratings);
}

export function findPlayerById(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId) ?? null;
}

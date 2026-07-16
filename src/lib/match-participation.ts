import type { Match, MatchStat, MvpVote, PlayerRating } from '@/types/domain';

export function getDuplicateParticipationMessage(input: {
  attendanceCount: number;
  matchStatsCount: number;
}) {
  if (input.attendanceCount > 1) {
    return 'Existem múltiplos registros de presença para este jogador e partida. Revise os dados antes de editar.';
  }

  if (input.matchStatsCount > 1) {
    return 'Existem múltiplas súmulas para este jogador e partida. Revise os dados antes de editar.';
  }

  return null;
}

export function findDuplicateMatchStatPlayerId(matchStats: MatchStat[]) {
  const seen = new Set<string>();

  for (const stat of matchStats) {
    if (seen.has(stat.playerId)) {
      return stat.playerId;
    }
    seen.add(stat.playerId);
  }

  return null;
}

export function getParticipationRemovalBlocker(input: {
  playerId: string;
  match: Pick<
    Match,
    'manualMvpPlayerId' | 'mvpWinnerPlayerIds'
  >;
  matchStat?: MatchStat | null;
  ratings: PlayerRating[];
  votes: MvpVote[];
}) {
  const stat = input.matchStat;

  if (stat && (stat.goals > 0 || stat.assists > 0)) {
    return 'Não é possível remover a participação enquanto houver gols ou assistências. Corrija os eventos explicitamente primeiro.';
  }

  if (
    stat &&
    ((stat.yellowCards ?? 0) > 0 ||
      (stat.redCards ?? 0) > 0 ||
      Boolean(stat.notes?.trim()))
  ) {
    return 'Não é possível remover a participação enquanto houver cartões ou observações na súmula.';
  }

  if (
    input.ratings.some(
      (rating) =>
        rating.raterPlayerId === input.playerId ||
        rating.targetPlayerId === input.playerId,
    )
  ) {
    return 'Não é possível remover a participação enquanto houver avaliações vinculadas ao jogador.';
  }

  if (
    input.votes.some(
      (vote) =>
        vote.voterPlayerId === input.playerId ||
        vote.targetPlayerId === input.playerId,
    ) ||
    input.match.manualMvpPlayerId === input.playerId ||
    input.match.mvpWinnerPlayerIds?.includes(input.playerId)
  ) {
    return 'Não é possível remover a participação enquanto houver voto ou resultado de MVP vinculado ao jogador.';
  }

  return null;
}

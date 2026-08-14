/**
 * Resumo do último jogo para a Home: placar, quem marcou, quem deu assistência,
 * o MVP e o melhor em notas.
 *
 * Cálculo puro: entra o snapshot, sai o que a tela precisa mostrar. A Home só
 * renderiza — nenhuma regra fica na camada visual.
 */

import type { Match, MatchResult } from '@/types/domain';
import type { AppSnapshot } from '@/services/repository/types';

export interface HighlightPlayer {
  playerId: string;
  nickname: string;
  fullName: string;
  photoUrl: string | null;
  value: number;
}

export interface MvpStanding {
  playerId: string;
  nickname: string;
  photoUrl: string | null;
  votes: number;
  isWinner: boolean;
}

export interface MatchHighlights {
  match: Match;
  result: MatchResult | null;
  teamScore: number;
  opponentScore: number;
  scorers: HighlightPlayer[];
  assists: HighlightPlayer[];
  totalGoals: number;
  totalAssists: number;
  /** Votação de MVP: parcial enquanto aberta, campeão quando fechada. */
  mvpStandings: MvpStanding[];
  mvpTotalVotes: number;
  mvpDecided: boolean;
  /** Maior média de nota da partida, quando já houve avaliação. */
  topRated: HighlightPlayer | null;
}

function findPlayer(snapshot: AppSnapshot, playerId: string) {
  return snapshot.players.find((player) => player.id === playerId) ?? null;
}

function toHighlightPlayer(
  snapshot: AppSnapshot,
  playerId: string,
  value: number,
): HighlightPlayer | null {
  const player = findPlayer(snapshot, playerId);

  if (!player) {
    return null;
  }

  return {
    playerId,
    nickname: player.nickname,
    fullName: player.fullName,
    photoUrl: player.photoUrl ?? null,
    value,
  };
}

/** Ordena por valor decrescente e, em empate, por nome — evita ordem instável. */
function sortHighlights(entries: HighlightPlayer[]) {
  return entries.sort(
    (a, b) => b.value - a.value || a.nickname.localeCompare(b.nickname, 'pt-BR'),
  );
}

/** A partida encerrada mais recente do time. */
export function findLastFinishedMatch(
  snapshot: AppSnapshot,
  teamId: string,
): Match | null {
  const finished = snapshot.matches
    .filter(
      (match) =>
        match.teamId === teamId && match.status === 'finished' && !match.deletedAt,
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return finished[0] ?? null;
}

export function buildMatchHighlights(
  snapshot: AppSnapshot,
  match: Match,
): MatchHighlights {
  const stats = snapshot.matchStats.filter((stat) => stat.matchId === match.id);

  const scorers = sortHighlights(
    stats
      .filter((stat) => stat.goals > 0)
      .map((stat) => toHighlightPlayer(snapshot, stat.playerId, stat.goals))
      .filter((entry): entry is HighlightPlayer => entry !== null),
  );

  const assists = sortHighlights(
    stats
      .filter((stat) => stat.assists > 0)
      .map((stat) => toHighlightPlayer(snapshot, stat.playerId, stat.assists))
      .filter((entry): entry is HighlightPlayer => entry !== null),
  );

  // ── MVP ────────────────────────────────────────────────────────────────
  const votes = snapshot.mvpVotes.filter((vote) => vote.matchId === match.id);
  const votesByPlayer = new Map<string, number>();

  for (const vote of votes) {
    votesByPlayer.set(vote.targetPlayerId, (votesByPlayer.get(vote.targetPlayerId) ?? 0) + 1);
  }

  const winnerIds = new Set(match.mvpWinnerPlayerIds ?? []);
  const mvpDecided = winnerIds.size > 0;

  const mvpStandings: MvpStanding[] = [...votesByPlayer.entries()]
    .map(([playerId, count]) => {
      const player = findPlayer(snapshot, playerId);

      return player
        ? {
            playerId,
            nickname: player.nickname,
            photoUrl: player.photoUrl ?? null,
            votes: count,
            isWinner: winnerIds.has(playerId),
          }
        : null;
    })
    .filter((entry): entry is MvpStanding => entry !== null)
    .sort((a, b) => b.votes - a.votes || a.nickname.localeCompare(b.nickname, 'pt-BR'));

  // ── Melhor em notas ────────────────────────────────────────────────────
  const ratings = snapshot.playerRatings.filter((rating) => rating.matchId === match.id);
  const ratingTotals = new Map<string, { sum: number; count: number }>();

  for (const rating of ratings) {
    const current = ratingTotals.get(rating.targetPlayerId) ?? { sum: 0, count: 0 };
    current.sum += rating.overall;
    current.count += 1;
    ratingTotals.set(rating.targetPlayerId, current);
  }

  const rankedByRating = sortHighlights(
    [...ratingTotals.entries()]
      .map(([playerId, totals]) =>
        toHighlightPlayer(
          snapshot,
          playerId,
          // Média, não soma: quem recebeu mais votos não é necessariamente
          // quem jogou melhor.
          totals.count > 0 ? totals.sum / totals.count : 0,
        ),
      )
      .filter((entry): entry is HighlightPlayer => entry !== null),
  );

  return {
    match,
    result: match.scoreboard?.result ?? null,
    teamScore: match.scoreboard?.team ?? 0,
    opponentScore: match.scoreboard?.opponent ?? 0,
    scorers,
    assists,
    totalGoals: scorers.reduce((sum, entry) => sum + entry.value, 0),
    totalAssists: assists.reduce((sum, entry) => sum + entry.value, 0),
    mvpStandings,
    mvpTotalVotes: votes.length,
    mvpDecided,
    topRated: rankedByRating[0] ?? null,
  };
}

/** Atalho: resumo da última partida encerrada, ou `null` se não houver. */
export function buildLastMatchHighlights(
  snapshot: AppSnapshot,
  teamId: string,
): MatchHighlights | null {
  const match = findLastFinishedMatch(snapshot, teamId);
  return match ? buildMatchHighlights(snapshot, match) : null;
}

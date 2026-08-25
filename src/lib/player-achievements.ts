import { matchDateTime, sortMatchesByDate } from '@/lib/date';
import { calculateMatchMvpBreakdown, buildRatingSummary, formatStatNumber } from '@/lib/stats';
import type {
  AttendanceRecord,
  Match,
  MatchStat,
  MvpVote,
  Player,
  PlayerRating,
  TeamRatingCriterion,
} from '@/types/domain';

export type PlayerAchievementTone =
  | 'gold'
  | 'fire'
  | 'success'
  | 'blue'
  | 'purple'
  | 'neutral'
  | 'yellow'
  | 'danger';

export interface PlayerAchievement {
  id: string;
  label: string;
  description: string;
  icon: string;
  tone: PlayerAchievementTone;
  priority: number;
}

interface BuildPlayerAchievementsInput {
  player: Player;
  matches: Match[];
  attendance: AttendanceRecord[];
  matchStats: MatchStat[];
  mvpVotes?: MvpVote[];
  ratings?: PlayerRating[];
  ratingCriteria?: TeamRatingCriterion[];
}

interface BuildTeamPlayerAchievementsInput {
  players: Player[];
  matches: Match[];
  attendance: AttendanceRecord[];
  matchStats: MatchStat[];
  mvpVotes?: MvpVote[];
  ratings?: PlayerRating[];
  ratingCriteria?: TeamRatingCriterion[];
}

interface PlayerMomentEntry {
  matchId: string;
  confirmed: boolean;
  hasGoalParticipation: boolean;
  isMvpWinner: boolean;
  /** Jogou e levou pelo menos um cartão, de qualquer cor. */
  levouCartao: boolean;
  /** Jogou e saiu sem cartão. Diferente de não ter jogado. */
  jogouLimpo: boolean;
  amarelos: number;
  vermelhos: number;
}

interface PlayerAchievementCandidate extends PlayerAchievement {
  family: 'mvp' | 'goal-participation' | 'presence' | 'rating' | 'discipline';
}

function groupByPlayerId<T extends { playerId: string }>(items: T[]) {
  return items.reduce<Map<string, T[]>>((acc, item) => {
    const current = acc.get(item.playerId) ?? [];
    acc.set(item.playerId, [...current, item]);
    return acc;
  }, new Map());
}

function groupRatingsByTargetPlayerId(items: PlayerRating[]) {
  return items.reduce<Map<string, PlayerRating[]>>((acc, item) => {
    const current = acc.get(item.targetPlayerId) ?? [];
    acc.set(item.targetPlayerId, [...current, item]);
    return acc;
  }, new Map());
}

function buildConfirmedPlayerIdsByMatch(attendance: AttendanceRecord[]) {
  return attendance.reduce<Map<string, Set<string>>>((acc, item) => {
    if (item.status !== 'confirmed') {
      return acc;
    }

    const current = acc.get(item.matchId) ?? new Set<string>();
    current.add(item.playerId);
    acc.set(item.matchId, current);
    return acc;
  }, new Map());
}

function groupMvpVotesByMatchId(votes: MvpVote[]) {
  return votes.reduce<Map<string, MvpVote[]>>((acc, vote) => {
    const current = acc.get(vote.matchId) ?? [];
    acc.set(vote.matchId, [...current, vote]);
    return acc;
  }, new Map());
}

function toValidDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildEligibleFinishedMatches(player: Player, matches: Match[]) {
  const joinedAt = toValidDate(player.createdAt);

  return sortMatchesByDate(
    matches.filter((match) => {
      if (match.teamId !== player.teamId || match.status !== 'finished') {
        return false;
      }

      if (!joinedAt) {
        return true;
      }

      return matchDateTime(match).getTime() >= joinedAt.getTime();
    }),
  );
}

function buildFinishedTeamMatches(teamId: string, matches: Match[]) {
  return sortMatchesByDate(
    matches.filter((match) => match.teamId === teamId && match.status === 'finished'),
  );
}

function resolveWinnerIdsByMatch(input: {
  matches: Match[];
  attendance: AttendanceRecord[];
  mvpVotes?: MvpVote[];
}) {
  const winnerIdsByMatch = new Map<string, Set<string>>();
  const confirmedPlayerIdsByMatch = buildConfirmedPlayerIdsByMatch(input.attendance);
  const votesByMatchId = groupMvpVotesByMatchId(input.mvpVotes ?? []);

  for (const match of input.matches) {
    const persistedWinnerIds = match.mvpWinnerPlayerIds ?? [];

    if (persistedWinnerIds.length > 0) {
      winnerIdsByMatch.set(match.id, new Set(persistedWinnerIds));
      continue;
    }

    const matchVotes = votesByMatchId.get(match.id) ?? [];

    if (matchVotes.length === 0) {
      winnerIdsByMatch.set(match.id, new Set());
      continue;
    }

    const confirmedPlayerIds = confirmedPlayerIdsByMatch.get(match.id) ?? new Set<string>();
    const eligibleVotes = matchVotes.filter(
      (vote) =>
        confirmedPlayerIds.has(vote.voterPlayerId) &&
        confirmedPlayerIds.has(vote.targetPlayerId),
    );

    const breakdown = calculateMatchMvpBreakdown({ votes: eligibleVotes });
    winnerIdsByMatch.set(match.id, new Set(breakdown.winnerPlayerIds));
  }

  return winnerIdsByMatch;
}

function countCurrentStreak<T>(items: T[], predicate: (item: T) => boolean) {
  let streak = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!predicate(items[index])) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function getPresenceCandidate(streak: number): PlayerAchievementCandidate | null {
  if (streak >= 20) {
    return {
      id: 'presence-example',
      family: 'presence',
      label: 'Exemplo para o time',
      description: `${streak} presenças confirmadas seguidas em partidas encerradas.`,
      icon: '\u{1F6E1}\uFE0F',
      tone: 'blue',
      priority: 84,
    };
  }

  if (streak >= 10) {
    return {
      id: 'presence-committed',
      family: 'presence',
      label: 'Comprometido',
      description: `${streak} presenças confirmadas seguidas em partidas encerradas.`,
      icon: '\u{1F4AA}',
      tone: 'success',
      priority: 72,
    };
  }

  if (streak >= 5) {
    return {
      id: 'presence-present',
      family: 'presence',
      label: 'Presente',
      description: `${streak} presenças confirmadas seguidas em partidas encerradas.`,
      icon: '\u2705',
      tone: 'success',
      priority: 60,
    };
  }

  return null;
}

function getGoalParticipationCandidate(streak: number): PlayerAchievementCandidate | null {
  if (streak >= 8) {
    return {
      id: 'goal-run-unstoppable',
      family: 'goal-participation',
      label: 'Imparável',
      description: `Participou de gols em ${streak} jogos seguidos.`,
      icon: '\u{1F680}',
      tone: 'purple',
      priority: 90,
    };
  }

  if (streak >= 5) {
    return {
      id: 'goal-run-hot',
      family: 'goal-participation',
      label: 'Artilharia ligada',
      description: `Participou de gols em ${streak} jogos seguidos.`,
      icon: '\u{1F525}',
      tone: 'fire',
      priority: 80,
    };
  }

  if (streak >= 3) {
    return {
      id: 'goal-run-good-phase',
      family: 'goal-participation',
      label: 'Em boa fase',
      description: `Participou de gols em ${streak} jogos seguidos.`,
      icon: '\u{1F525}',
      tone: 'fire',
      priority: 68,
    };
  }

  return null;
}

/**
 * Selos de cartão.
 *
 * A zoeira é o ponto: o time pediu que o cartão rendesse resenha no grupo, não
 * advertência. Por isso o texto é de vestiário, e o selo de jogo limpo existe
 * para quem nunca aparece aqui também ter o que mostrar.
 *
 * Prioridade abaixo da artilharia e do MVP de propósito. Levar vermelho é
 * piada, não é o que define o jogador — se alguém está numa sequência de gols e
 * levou um amarelo, o que aparece é a artilharia.
 */
/** Junta num lugar só o que os selos de cartão precisam saber. */
function resumirDisciplina(moments: PlayerMomentEntry[]) {
  const jogados = moments.filter((item) => item.levouCartao || item.jogouLimpo);

  return {
    // A sequência conta só os jogos em que a pessoa jogou: uma falta no meio
    // não deveria zerar a série de quem vinha levando cartão todo jogo.
    sequenciaComCartao: countCurrentStreak(jogados, (item) => item.levouCartao),
    sequenciaLimpa: countCurrentStreak(jogados, (item) => item.jogouLimpo),
    totalDeAmarelos: moments.reduce((soma, item) => soma + item.amarelos, 0),
    totalDeVermelhos: moments.reduce((soma, item) => soma + item.vermelhos, 0),
    jogosComputados: jogados.length,
  };
}

function getDisciplineCandidate(input: {
  sequenciaComCartao: number;
  sequenciaLimpa: number;
  totalDeAmarelos: number;
  totalDeVermelhos: number;
  jogosComputados: number;
}): PlayerAchievementCandidate | null {
  const { sequenciaComCartao, sequenciaLimpa, totalDeAmarelos, totalDeVermelhos } = input;

  if (totalDeVermelhos >= 2) {
    return {
      id: 'discipline-terror',
      family: 'discipline',
      label: 'Terror da várzea',
      description: `${totalDeVermelhos} vermelhos na conta. O juiz já entra no campo de olho.`,
      icon: '\u{1F7E5}',
      tone: 'danger',
      priority: 86,
    };
  }

  if (totalDeVermelhos === 1) {
    return {
      id: 'discipline-expulso',
      family: 'discipline',
      label: 'Vai acabar preso',
      description: 'Tomou vermelho. Da próxima, respira antes da dividida.',
      icon: '\u{1F7E5}',
      tone: 'danger',
      priority: 82,
    };
  }

  if (sequenciaComCartao >= 3) {
    return {
      id: 'discipline-nervoso',
      family: 'discipline',
      label: 'Perna de pau nervoso',
      description: `Cartão em ${sequenciaComCartao} jogos seguidos. Precisa chegar mais leve.`,
      icon: '\u{1F7E8}',
      tone: 'yellow',
      priority: 74,
    };
  }

  if (totalDeAmarelos >= 5) {
    return {
      id: 'discipline-conhecido',
      family: 'discipline',
      label: 'Juiz já sabe seu nome',
      description: `${totalDeAmarelos} amarelos no total. Tá nervoso, vai pescar.`,
      icon: '\u{1F7E8}',
      tone: 'yellow',
      priority: 66,
    };
  }

  // Só vale como elogio quem tem estrada: dois jogos sem cartão não é
  // disciplina, é amostra pequena.
  if (sequenciaLimpa >= 10 && input.jogosComputados >= 10) {
    return {
      id: 'discipline-santo',
      family: 'discipline',
      label: 'Nunca nem viu',
      description: `${sequenciaLimpa} jogos seguidos sem cartão nenhum.`,
      icon: '\u{1F54A}️',
      tone: 'success',
      priority: 58,
    };
  }

  return null;
}

function getMvpCandidate(streak: number): PlayerAchievementCandidate | null {
  if (streak >= 5) {
    return {
      id: 'mvp-legend',
      family: 'mvp',
      label: 'Lenda do time',
      description: `${streak} MVPs consecutivos nas últimas partidas encerradas.`,
      icon: '\u{1F3C6}',
      tone: 'gold',
      priority: 96,
    };
  }

  if (streak >= 3) {
    return {
      id: 'mvp-king',
      family: 'mvp',
      label: 'Rei da partida',
      description: `${streak} MVPs consecutivos nas últimas partidas encerradas.`,
      icon: '\u{1F451}',
      tone: 'gold',
      priority: 88,
    };
  }

  if (streak >= 2) {
    return {
      id: 'mvp-hot',
      family: 'mvp',
      label: 'MVP quente',
      description: `${streak} MVPs consecutivos nas últimas partidas encerradas.`,
      icon: '\u2B50',
      tone: 'gold',
      priority: 76,
    };
  }

  return null;
}

function getRatingCandidate(
  ratings: PlayerRating[],
  ratingCriteria: TeamRatingCriterion[],
): PlayerAchievementCandidate | null {
  const summary = buildRatingSummary(ratings, ratingCriteria);
  const average = summary.overallAverage;

  if (summary.totalRatings === 0) {
    return null;
  }

  if (average >= 9) {
    return {
      id: 'rating-star',
      family: 'rating',
      label: 'Craque',
      description: `Média geral ${formatStatNumber(average, 1)} nas avaliações do elenco.`,
      icon: '\u{1F48E}',
      tone: 'purple',
      priority: 94,
    };
  }

  if (average >= 8) {
    return {
      id: 'rating-highlight',
      family: 'rating',
      label: 'Destaque',
      description: `Média geral ${formatStatNumber(average, 1)} nas avaliações do elenco.`,
      icon: '\u{1F31F}',
      tone: 'gold',
      priority: 82,
    };
  }

  if (average >= 7) {
    return {
      id: 'rating-regular',
      family: 'rating',
      label: 'Regular',
      description: `Média geral ${formatStatNumber(average, 1)} nas avaliações do elenco.`,
      icon: '\u{1F4C8}',
      tone: 'blue',
      priority: 64,
    };
  }

  return null;
}

function sortAchievements(achievements: PlayerAchievement[]) {
  return [...achievements].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    return left.label.localeCompare(right.label);
  });
}

function buildPlayerMoments(input: {
  player: Player;
  matches: Match[];
  attendance: AttendanceRecord[];
  matchStats: MatchStat[];
  winnerIdsByMatch: Map<string, Set<string>>;
}) {
  const attendanceByMatchId = new Map(
    input.attendance
      .filter((item) => item.playerId === input.player.id)
      .map((item) => [item.matchId, item] as const),
  );
  const matchStatByMatchId = new Map(
    input.matchStats
      .filter((item) => item.playerId === input.player.id)
      .map((item) => [item.matchId, item] as const),
  );

  return input.matches.map<PlayerMomentEntry>((match) => {
    const attendance = attendanceByMatchId.get(match.id) ?? null;
    const stat = matchStatByMatchId.get(match.id) ?? null;
    const winnerIds = input.winnerIdsByMatch.get(match.id) ?? new Set<string>();

    const amarelos = stat?.played ? stat.yellowCards ?? 0 : 0;
    const vermelhos = stat?.played ? stat.redCards ?? 0 : 0;

    return {
      matchId: match.id,
      confirmed: attendance?.status === 'confirmed',
      hasGoalParticipation: Boolean(stat?.played && ((stat.goals ?? 0) > 0 || (stat.assists ?? 0) > 0)),
      isMvpWinner: winnerIds.has(input.player.id),
      levouCartao: amarelos > 0 || vermelhos > 0,
      // Quem não jogou não entra: ficar de fora não é disciplina, e contar
      // como jogo limpo daria selo de santo para quem só faltou.
      jogouLimpo: Boolean(stat?.played) && amarelos === 0 && vermelhos === 0,
      amarelos,
      vermelhos,
    };
  });
}

export function buildPlayerAchievements(input: BuildPlayerAchievementsInput) {
  const matches = buildEligibleFinishedMatches(input.player, input.matches);

  if (matches.length === 0) {
    return [] as PlayerAchievement[];
  }

  const eligibleMatchIds = new Set(matches.map((match) => match.id));
  const winnerIdsByMatch = resolveWinnerIdsByMatch({
    matches,
    attendance: input.attendance.filter((item) => item.teamId === input.player.teamId),
    mvpVotes: input.mvpVotes?.filter((vote) => vote.teamId === input.player.teamId),
  });
  const moments = buildPlayerMoments({
    player: input.player,
    matches,
    attendance: input.attendance.filter((item) => item.teamId === input.player.teamId),
    matchStats: input.matchStats.filter((item) => item.teamId === input.player.teamId),
    winnerIdsByMatch,
  });
  const playerRatings = (input.ratings ?? []).filter(
    (rating) =>
      rating.teamId === input.player.teamId &&
      rating.targetPlayerId === input.player.id &&
      eligibleMatchIds.has(rating.matchId),
  );

  const candidates = [
    getMvpCandidate(countCurrentStreak(moments, (item) => item.isMvpWinner)),
    getGoalParticipationCandidate(
      countCurrentStreak(moments, (item) => item.hasGoalParticipation),
    ),
    getPresenceCandidate(countCurrentStreak(moments, (item) => item.confirmed)),
    getDisciplineCandidate(resumirDisciplina(moments)),
    getRatingCandidate(playerRatings, input.ratingCriteria ?? []),
  ].filter((item): item is PlayerAchievementCandidate => Boolean(item));

  return sortAchievements(candidates);
}

export function buildTeamPlayerAchievementMap(input: BuildTeamPlayerAchievementsInput) {
  const players = input.players;
  const teamId = players[0]?.teamId;

  if (!teamId || players.length === 0) {
    return new Map<string, PlayerAchievement[]>();
  }

  const teamMatches = input.matches.filter((match) => match.teamId === teamId);
  const teamAttendance = input.attendance.filter((item) => item.teamId === teamId);
  const teamMatchStats = input.matchStats.filter((item) => item.teamId === teamId);
  const teamRatings = (input.ratings ?? []).filter((item) => item.teamId === teamId);
  const teamVotes = (input.mvpVotes ?? []).filter((item) => item.teamId === teamId);

  const finishedMatches = buildFinishedTeamMatches(teamId, teamMatches);
  const winnerIdsByMatch = resolveWinnerIdsByMatch({
    matches: finishedMatches,
    attendance: teamAttendance,
    mvpVotes: teamVotes,
  });
  const attendanceByPlayerId = groupByPlayerId(teamAttendance);
  const matchStatsByPlayerId = groupByPlayerId(teamMatchStats);
  const ratingsByPlayerId = groupRatingsByTargetPlayerId(teamRatings);

  return players.reduce<Map<string, PlayerAchievement[]>>((acc, player) => {
    const playerMatches = buildEligibleFinishedMatches(player, teamMatches);
    const eligibleMatchIds = new Set(playerMatches.map((match) => match.id));
    const moments = buildPlayerMoments({
      player,
      matches: playerMatches,
      attendance: attendanceByPlayerId.get(player.id) ?? [],
      matchStats: matchStatsByPlayerId.get(player.id) ?? [],
      winnerIdsByMatch,
    });
    const candidates = [
      getMvpCandidate(countCurrentStreak(moments, (item) => item.isMvpWinner)),
      getGoalParticipationCandidate(
        countCurrentStreak(moments, (item) => item.hasGoalParticipation),
      ),
      getPresenceCandidate(countCurrentStreak(moments, (item) => item.confirmed)),
    getDisciplineCandidate(resumirDisciplina(moments)),
      getRatingCandidate(
        (ratingsByPlayerId.get(player.id) ?? []).filter((rating) =>
          eligibleMatchIds.has(rating.matchId),
        ),
        input.ratingCriteria ?? [],
      ),
    ].filter((item): item is PlayerAchievementCandidate => Boolean(item));

    acc.set(player.id, sortAchievements(candidates));
    return acc;
  }, new Map());
}

export function getTopPlayerAchievements(
  achievements: PlayerAchievement[],
  limit: number,
) {
  if (limit <= 0) {
    return [];
  }

  return sortAchievements(achievements).slice(0, limit);
}

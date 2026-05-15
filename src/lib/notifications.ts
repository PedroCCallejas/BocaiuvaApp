import { formatDateTimeBR } from '@/lib/date';
import type {
  AppNotification,
  AttendanceStatus,
  Match,
  NotificationType,
  Player,
} from '@/types/domain';

function uniqueUserIds(userIds: Array<string | null | undefined>) {
  return [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
}

function matchMoment(match: Pick<Match, 'date' | 'time'>) {
  return formatDateTimeBR({
    date: match.date,
    time: match.time,
  });
}

function buildNotification(params: {
  id: string;
  teamId: string;
  type: NotificationType;
  title: string;
  message: string;
  updatedAt: string;
  createdAt?: string;
  matchId?: string | null;
  playerId?: string | null;
  actorUserId?: string | null;
}) {
  return {
    id: params.id,
    teamId: params.teamId,
    type: params.type,
    title: params.title,
    message: params.message,
    matchId: params.matchId ?? null,
    playerId: params.playerId ?? null,
    actorUserId: params.actorUserId ?? null,
    readByUserIds: uniqueUserIds([params.actorUserId]),
    createdAt: params.createdAt ?? params.updatedAt,
    updatedAt: params.updatedAt,
  } satisfies AppNotification;
}

export function buildNotificationId(
  type: NotificationType,
  ...parts: string[]
) {
  return ['notification', type, ...parts].join('__');
}

export function sortNotificationsByDate(notifications: AppNotification[]) {
  return [...notifications].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function isNotificationRead(
  notification: AppNotification,
  userId?: string | null,
) {
  if (!userId) {
    return false;
  }

  return notification.readByUserIds.includes(userId);
}

export function createMatchCreatedNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: 'match-created',
    title: 'Nova partida marcada',
    message: `${params.match.opponentName} em ${matchMoment(params.match)} no ${params.match.venue}.`,
    matchId: params.match.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

export function createMatchUpdatedNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: 'match-updated',
    title: 'Partida atualizada',
    message: `${params.match.opponentName} agora esta marcada para ${matchMoment(params.match)} no ${params.match.venue}.`,
    matchId: params.match.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

export function createAttendanceNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  player: Pick<Player, 'id' | 'nickname'>;
  status: Extract<AttendanceStatus, 'confirmed' | 'absent'>;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  const confirmed = params.status === 'confirmed';

  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: confirmed ? 'attendance-confirmed' : 'attendance-absent',
    title: confirmed
      ? `${params.player.nickname} confirmou presenca`
      : `${params.player.nickname} marcou ausencia`,
    message: `Resposta para ${params.match.opponentName} em ${matchMoment(params.match)}.`,
    matchId: params.match.id,
    playerId: params.player.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

export function createLineupPublishedNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: 'lineup-published',
    title: 'Escalacao publicada',
    message: `A formacao para ${params.match.opponentName} ja esta pronta.`,
    matchId: params.match.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

export function createMatchFinishedNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  const scoreboard = params.match.scoreboard;
  const scoreline = scoreboard
    ? `${scoreboard.team} x ${scoreboard.opponent}`
    : 'placar final definido';

  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: 'match-finished',
    title: 'Partida encerrada',
    message: `${params.match.opponentName} terminou em ${scoreline}.`,
    matchId: params.match.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

export function createMvpVotingOpenedNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: 'mvp-voting-opened',
    title: 'Craque da partida liberado',
    message: `Quem participou de ${params.match.opponentName} ja pode votar no destaque do jogo.`,
    matchId: params.match.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

export function createRatingsOpenedNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: 'ratings-opened',
    title: 'Notas do jogo liberadas',
    message: `As avaliacoes de ${params.match.opponentName} ja estao abertas para quem participou.`,
    matchId: params.match.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

export function createMvpWinnerNotification(params: {
  id: string;
  teamId: string;
  match: Match;
  winner: Pick<Player, 'id' | 'nickname'>;
  actorUserId?: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  return buildNotification({
    id: params.id,
    teamId: params.teamId,
    type: 'mvp-winner',
    title: `${params.winner.nickname} foi o destaque`,
    message: `O elenco escolheu ${params.winner.nickname} como craque contra ${params.match.opponentName}.`,
    matchId: params.match.id,
    playerId: params.winner.id,
    actorUserId: params.actorUserId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

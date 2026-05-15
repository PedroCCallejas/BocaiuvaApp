import type { AppNotification, NotificationType } from '@/types/domain';

export const PUSH_NOTIFICATION_TYPES = [
  'match-created',
  'match-updated',
  'attendance-confirmed',
  'attendance-absent',
  'lineup-published',
  'match-finished',
  'mvp-voting-opened',
] as const;

export type PushNotificationType = (typeof PUSH_NOTIFICATION_TYPES)[number];

export interface PushDispatchPayload {
  notificationId: string;
  teamId: string;
  type: PushNotificationType;
  title: string;
  body: string;
  data: {
    notificationId: string;
    teamId: string;
    type: PushNotificationType;
    matchId: string | null;
    playerId: string | null;
    actorUserId: string | null;
  };
}

export function isPushNotificationType(
  type: NotificationType,
): type is PushNotificationType {
  return PUSH_NOTIFICATION_TYPES.includes(type as PushNotificationType);
}

export function buildPushDispatchPayload(
  notification: AppNotification,
): PushDispatchPayload | null {
  if (!isPushNotificationType(notification.type)) {
    return null;
  }

  return {
    notificationId: notification.id,
    teamId: notification.teamId,
    type: notification.type,
    title: notification.title,
    body: notification.message,
    data: {
      notificationId: notification.id,
      teamId: notification.teamId,
      type: notification.type,
      matchId: notification.matchId ?? null,
      playerId: notification.playerId ?? null,
      actorUserId: notification.actorUserId ?? null,
    },
  };
}

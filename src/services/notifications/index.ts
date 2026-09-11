import {
  desativarPush,
  pushConfigurado,
  sincronizarPush,
} from './push-subscriptions';

export async function setupNotificationHandler() {
  // Web Push é configurado pelo service worker quando a pessoa ativa os avisos.
}

export const initializeNotifications = setupNotificationHandler;

export async function registerForPushNotificationsAsync() {
  return null;
}

export async function syncCurrentUserPushToken(userId: string) {
  if (!pushConfigurado()) return null;
  await sincronizarPush(userId);
  return 'web-push';
}

export async function clearCurrentUserPushToken(_userId: string) {
  await desativarPush();
}

export const removeCurrentUserPushToken = clearCurrentUserPushToken;
export {
  buildPushDispatchPayload,
  isPushNotificationType,
  PUSH_NOTIFICATION_TYPES,
} from './push-contract';

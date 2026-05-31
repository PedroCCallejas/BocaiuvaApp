import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { NotificationCard } from '@/components/cards/NotificationCard';
import { SyncStatusCard } from '@/components/cards/SyncStatusCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useAppStore } from '@/store/app-store';
import {
  selectCurrentUser,
  selectCurrentTeam,
  selectIsRefreshingData,
  selectSyncStatusHint,
  selectSyncStatusMessage,
  selectTeamNotifications,
  selectUnreadNotifications,
  selectUnreadNotificationsCount,
} from '@/store/selectors';
import type { AppNotification } from '@/types/domain';

export default function NotificationsScreen() {
  const isWeb = Platform.OS === 'web';
  const team = useAppStore(selectCurrentTeam);
  const currentUser = useAppStore(selectCurrentUser);
  const notifications = useAppStore(selectTeamNotifications);
  const unreadNotifications = useAppStore(selectUnreadNotifications);
  const unreadCount = useAppStore(selectUnreadNotificationsCount);
  const refreshData = useAppStore((state) => state.refreshData);
  const markNotificationAsRead = useAppStore((state) => state.markNotificationAsRead);
  const markAllNotificationsAsRead = useAppStore((state) => state.markAllNotificationsAsRead);
  const refreshing = useAppStore(selectIsRefreshingData);
  const syncMessage = useAppStore(selectSyncStatusMessage);
  const syncHint = useAppStore(selectSyncStatusHint);
  const [loadingNotificationId, setLoadingNotificationId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadIds = useMemo(
    () => new Set(unreadNotifications.map((notification) => notification.id)),
    [unreadNotifications],
  );

  if (!team || !currentUser) {
    return null;
  }

  async function handleMarkAsRead(notificationId: string) {
    try {
      setLoadingNotificationId(notificationId);
      await markNotificationAsRead(notificationId);
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar a notificação',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setLoadingNotificationId(null);
    }
  }

  async function handleOpenNotification(notification: AppNotification) {
    try {
      if (unreadIds.has(notification.id)) {
        setLoadingNotificationId(notification.id);
        await markNotificationAsRead(notification.id);
      }

      if (notification.matchId) {
        router.push(`/matches/${notification.matchId}`);
      }
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a notificação',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setLoadingNotificationId(null);
    }
  }

  async function handleMarkAllAsRead() {
    try {
      setMarkingAll(true);
      await markAllNotificationsAsRead();
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar as notificações',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Screen onRefresh={() => void refreshData()} refreshing={refreshing}>
      {!isWeb ? (
        <SectionHeader
          title="Notificações"
          subtitle={
            unreadCount > 0
              ? `${unreadCount} novidade(s) no ${team.name}`
              : `Tudo em dia no ${team.name}`
          }
        />
      ) : null}

      <SyncStatusCard
        hint={syncHint}
        loading={refreshing}
        message={syncMessage}
        onRefresh={() => void refreshData()}
      />

      {unreadCount > 0 ? (
        <AppButton
          label="Marcar todas como lidas"
          variant="secondary"
          loading={markingAll}
          onPress={handleMarkAllAsRead}
        />
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          title="Sem notificações por enquanto"
          description="As movimentações importantes do time vão aparecer aqui."
        />
      ) : null}

      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          unread={unreadIds.has(notification.id)}
          onPress={() => void handleOpenNotification(notification)}
          onMarkAsRead={
            unreadIds.has(notification.id) && loadingNotificationId !== notification.id
              ? () => void handleMarkAsRead(notification.id)
              : undefined
          }
        />
      ))}
    </Screen>
  );
}

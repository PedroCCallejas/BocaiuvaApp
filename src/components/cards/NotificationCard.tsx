import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateTimeBR } from '@/lib/date';
import type { AppNotification, NotificationType } from '@/types/domain';

interface NotificationCardProps {
  notification: AppNotification;
  unread?: boolean;
  onPress?: () => void;
  onMarkAsRead?: () => void;
}

function iconNameForType(type: NotificationType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'match-created':
    case 'match-updated':
      return 'calendar-outline';
    case 'attendance-confirmed':
      return 'checkmark-circle-outline';
    case 'attendance-absent':
      return 'close-circle-outline';
    case 'lineup-published':
      return 'people-circle-outline';
    case 'match-finished':
      return 'flag-outline';
    case 'mvp-voting-opened':
      return 'sparkles-outline';
    case 'mvp-winner':
      return 'trophy-outline';
    case 'ratings-opened':
      return 'star-outline';
    case 'match-diary-published':
      return 'book-outline';
    default:
      return 'notifications-outline';
  }
}

export function NotificationCard({
  notification,
  unread,
  onPress,
  onMarkAsRead,
}: NotificationCardProps) {
  const theme = useAppTheme();
  const content = (
    <View style={styles.topRow}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: unread
              ? theme.colors.secondarySoft
              : theme.colors.primarySoft,
          },
        ]}>
        <Ionicons
          name={iconNameForType(notification.type)}
          size={20}
          color={theme.colors.secondary}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {notification.title}
          </Text>
          {unread ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.secondarySoft },
              ]}>
              <Text style={[styles.badgeText, { color: theme.colors.secondary }]}>
                Nova
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.message, { color: theme.colors.textMuted }]}>
          {notification.message}
        </Text>
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: unread ? theme.colors.surfaceMuted : theme.colors.surface,
          borderColor: unread
            ? theme.colors.secondary
            : theme.colors.border,
        },
      ]}>
      {onPress ? (
        <Pressable onPress={onPress} style={styles.content}>
          {content}
        </Pressable>
      ) : (
        <View style={styles.content}>{content}</View>
      )}

      <View style={styles.footer}>
        <Text style={[styles.time, { color: theme.colors.textMuted }]}>
          {formatDateTimeBR(notification.updatedAt)}
        </Text>
        {unread && onMarkAsRead ? (
          <Pressable onPress={onMarkAsRead}>
            <Text
              style={[
                styles.action,
                { color: theme.colors.accent ?? theme.colors.secondary },
              ]}>
              Marcar como lida
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  content: {
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: '800',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  time: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  action: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
  },
});

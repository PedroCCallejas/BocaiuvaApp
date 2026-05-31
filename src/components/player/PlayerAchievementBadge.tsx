import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { PlayerAchievement, PlayerAchievementTone } from '@/lib/player-achievements';

interface PlayerAchievementBadgeProps {
  achievement: PlayerAchievement;
  variant?: 'compact' | 'detail';
}

export function PlayerAchievementBadge({
  achievement,
  variant = 'compact',
}: PlayerAchievementBadgeProps) {
  const theme = useAppTheme();
  const palette = getPlayerAchievementTonePalette(achievement.tone, theme.colors.success);

  if (variant === 'detail') {
    return (
      <View
        style={[
          styles.detailCard,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
            shadowColor: palette.glow,
          },
        ]}>
        <View style={styles.detailHeader}>
          <Text style={styles.detailIcon}>{achievement.icon}</Text>
          <View style={styles.detailCopy}>
            <Text style={[styles.detailTitle, { color: palette.text }]}>{achievement.label}</Text>
            <Text style={[styles.detailDescription, { color: palette.textMuted }]}>
              {achievement.description}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.compactChip,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}>
      <Text style={styles.compactIcon}>{achievement.icon}</Text>
      <Text style={[styles.compactLabel, { color: palette.text }]}>{achievement.label}</Text>
    </View>
  );
}

export function getPlayerAchievementTonePalette(
  tone: PlayerAchievementTone,
  successColor = '#35C26B',
) {
  switch (tone) {
    case 'gold':
      return {
        background: 'rgba(244,197,66,0.16)',
        border: 'rgba(244,197,66,0.42)',
        text: '#F9E7A0',
        textMuted: 'rgba(249,231,160,0.84)',
        glow: '#F4C542',
      };
    case 'fire':
      return {
        background: 'rgba(255,122,26,0.18)',
        border: 'rgba(255,122,26,0.4)',
        text: '#FFD4B0',
        textMuted: 'rgba(255,212,176,0.84)',
        glow: '#FF7A1A',
      };
    case 'success':
      return {
        background: `${successColor}22`,
        border: `${successColor}55`,
        text: '#CFF6DD',
        textMuted: 'rgba(207,246,221,0.82)',
        glow: successColor,
      };
    case 'blue':
      return {
        background: 'rgba(95,168,255,0.18)',
        border: 'rgba(95,168,255,0.42)',
        text: '#CFE6FF',
        textMuted: 'rgba(207,230,255,0.82)',
        glow: '#5FA8FF',
      };
    case 'purple':
      return {
        background: 'rgba(185,140,255,0.18)',
        border: 'rgba(185,140,255,0.42)',
        text: '#E6D7FF',
        textMuted: 'rgba(230,215,255,0.82)',
        glow: '#B98CFF',
      };
    case 'neutral':
    default:
      return {
        background: 'rgba(255,255,255,0.08)',
        border: 'rgba(255,255,255,0.14)',
        text: '#F3F7F3',
        textMuted: 'rgba(243,247,243,0.74)',
        glow: '#AFC1B5',
      };
  }
}

const styles = StyleSheet.create({
  compactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  compactIcon: {
    fontSize: 12,
  },
  compactLabel: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  detailCopy: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  detailDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { PlayerAchievementBadge, getPlayerAchievementTonePalette } from '@/components/player/PlayerAchievementBadge';
import { FOOT_LABELS, PLAYER_STATUS_LABELS, POSITION_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { PlayerAchievement } from '@/lib/player-achievements';
import type { Player } from '@/types/domain';

export interface PlayerCardSummaryItem {
  label: string;
  value: string;
}

interface PlayerCardProps {
  player: Player;
  statsLabel?: string;
  onPress?: () => void;
  variant?: 'roster' | 'profile';
  achievements?: PlayerAchievement[];
  summaryItems?: PlayerCardSummaryItem[];
}

export function PlayerCard({
  player,
  statsLabel,
  onPress,
  variant = 'roster',
  achievements = [],
  summaryItems = [],
}: PlayerCardProps) {
  const theme = useAppTheme();
  const isProfile = variant === 'profile';
  const photoSize = isProfile ? 148 : 88;
  const bioLines = variant === 'profile' ? 3 : 2;
  const preferredTone =
    achievements.find((item) => item.tone === 'gold')?.tone ??
    achievements.find((item) => item.tone === 'fire')?.tone ??
    achievements[0]?.tone ??
    null;
  const tonePalette = preferredTone
    ? getPlayerAchievementTonePalette(preferredTone, theme.colors.success)
    : null;
  const displayName = player.nickname.trim() || player.fullName.trim();
  const supportingName =
    player.fullName.trim() && player.fullName.trim() !== displayName
      ? player.fullName.trim()
      : null;
  const hasProfileVideo = Boolean(
    player.presentationVideoUrl || player.introVideoUrl || player.celebrationVideoUrl,
  );
  const primaryPositionLabel = `\u{1F3AF} ${POSITION_LABELS[player.primaryPosition]}`;
  const secondaryLine =
    player.secondaryPositions.length > 0
      ? `Também joga: ${player.secondaryPositions.map((position) => POSITION_LABELS[position]).join(', ')}`
      : null;

  const content = (
    <>
      <LinearGradient
        colors={[
          tonePalette?.background ?? `${theme.colors.primary}20`,
          `${theme.colors.secondary}14`,
          'transparent',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroGlow, isProfile ? styles.heroGlowProfile : null]}
      />

      <View style={[styles.heroRow, isProfile ? styles.heroRowProfile : null]}>
        <View
          style={[
            styles.photoShell,
            isProfile ? styles.photoShellProfile : null,
            {
              width: photoSize + 18,
              height: photoSize + 18,
              borderRadius: (photoSize + 18) / 2,
              borderColor: tonePalette?.border ?? `${theme.colors.secondary}38`,
              shadowColor: tonePalette?.glow ?? theme.colors.primary,
              shadowOpacity: tonePalette ? 0.26 : 0.16,
            },
          ]}>
          <Avatar
            name={player.nickname}
            photoUrl={player.photoUrl}
            size={photoSize}
            accent={`${theme.colors.primary}22`}
          />
        </View>

        <View style={[styles.copy, isProfile ? styles.copyProfile : null]}>
          <View style={[styles.topLine, isProfile ? styles.topLineProfile : null]}>
            <View
              style={[
                styles.jerseyBadge,
                isProfile ? styles.jerseyBadgeProfile : null,
                {
                  backgroundColor: theme.colors.primarySoft,
                  borderColor: tonePalette?.border ?? `${theme.colors.primary}44`,
                },
              ]}>
              <Text
                style={[
                  styles.jerseyText,
                  isProfile ? styles.jerseyTextProfile : null,
                  { color: theme.colors.text },
                ]}>
                #{player.jerseyNumber}
              </Text>
            </View>
            <Pill
              label={PLAYER_STATUS_LABELS[player.status]}
              color={player.status === 'active' ? theme.colors.success : theme.colors.warning}
              backgroundColor={player.status === 'active' ? `${theme.colors.success}20` : `${theme.colors.warning}20`}
              borderColor={player.status === 'active' ? `${theme.colors.success}44` : `${theme.colors.warning}44`}
            />
          </View>

          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.name, isProfile ? styles.nameProfile : null, { color: theme.colors.text }]}>
            {displayName}
          </Text>
          {supportingName ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.fullName, { color: theme.colors.textMuted }]}>
              {supportingName}
            </Text>
          ) : null}

          <View
            style={[
              styles.positionBanner,
              isProfile ? styles.positionBannerProfile : null,
              {
                backgroundColor: `${theme.colors.secondary}18`,
                borderColor: `${theme.colors.secondary}44`,
              },
            ]}>
            <Text style={[styles.positionText, { color: theme.colors.text }]}>
              {primaryPositionLabel}
            </Text>
          </View>

          {secondaryLine ? (
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={[styles.secondaryLine, { color: theme.colors.textMuted }]}>
              {secondaryLine}
            </Text>
          ) : null}

          <View style={styles.tagRow}>
            {hasProfileVideo ? (
              <Pill
                label="▶ vídeo"
                color={theme.colors.secondary}
                backgroundColor={`${theme.colors.secondary}20`}
                borderColor={`${theme.colors.secondary}44`}
                textColor={theme.colors.text}
              />
            ) : null}
            <Pill
              label={`Pé ${FOOT_LABELS[player.dominantFoot]}`}
              color={theme.colors.accent}
              backgroundColor={`${theme.colors.accent}20`}
              borderColor={`${theme.colors.accent}44`}
              textColor={theme.colors.text}
            />
            {player.preferredPosition ? (
              <Pill
                label={`Fav ${POSITION_LABELS[player.preferredPosition]}`}
                color={theme.colors.secondary}
                backgroundColor={`${theme.colors.secondary}1A`}
                borderColor={`${theme.colors.secondary}38`}
                textColor={theme.colors.text}
              />
            ) : null}
          </View>
        </View>
      </View>

      {achievements.length > 0 ? (
        <View style={styles.achievementsRow}>
          {achievements.map((achievement) => (
            <PlayerAchievementBadge
              key={achievement.id}
              achievement={achievement}
            />
          ))}
        </View>
      ) : null}

      {summaryItems.length > 0 ? (
        <View style={[styles.summaryGrid, isProfile ? styles.summaryGridProfile : null]}>
          {summaryItems.map((item) => (
            <View
              key={item.label}
              style={[
                styles.summaryCard,
                isProfile ? styles.summaryCardProfile : null,
                {
                  backgroundColor: theme.colors.backgroundElevated,
                  borderColor: theme.colors.border,
                },
              ]}>
              <Text style={[styles.summaryValue, isProfile ? styles.summaryValueProfile : null, { color: theme.colors.text }]}>
                {item.value}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {player.bio ? (
        <View
          style={[
            styles.bioPanel,
            {
              backgroundColor: theme.colors.backgroundElevated,
              borderColor: theme.colors.border,
            },
          ]}>
          <Text numberOfLines={bioLines} style={[styles.bio, { color: theme.colors.textMuted }]}>
            {player.bio}
          </Text>
        </View>
      ) : null}

      {statsLabel ? (
        <View
          style={[
            styles.statsBar,
            {
              backgroundColor: tonePalette?.background ?? theme.colors.primarySoft,
              borderColor: tonePalette?.border ?? `${theme.colors.primary}2A`,
            },
          ]}>
          <Text style={[styles.statsText, { color: tonePalette?.text ?? theme.colors.secondary }]}>
            {statsLabel}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: theme.colors.surface,
            borderColor: tonePalette?.border ?? theme.colors.border,
            shadowColor: tonePalette?.glow ?? theme.colors.primary,
            shadowOpacity: tonePalette ? 0.24 : 0.12,
            opacity: pressed ? 0.97 : 1,
          },
        ]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: tonePalette?.border ?? theme.colors.border,
          shadowColor: tonePalette?.glow ?? theme.colors.primary,
          shadowOpacity: tonePalette ? 0.22 : 0.1,
        },
      ]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 30,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 210,
    height: 210,
    borderRadius: 105,
  },
  heroGlowProfile: {
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -54,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroRowProfile: {
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 20,
  },
  photoShell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  photoShellProfile: {
    marginTop: 4,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  copyProfile: {
    gap: 10,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  topLineProfile: {
    alignItems: 'center',
  },
  jerseyBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  jerseyBadgeProfile: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  jerseyText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
  },
  jerseyTextProfile: {
    fontSize: 16,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 31,
  },
  nameProfile: {
    fontSize: 38,
    lineHeight: 40,
  },
  fullName: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 18,
  },
  positionBanner: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  positionBannerProfile: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  positionText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  achievementsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryGridProfile: {
    gap: 12,
  },
  summaryCard: {
    minWidth: 86,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
    alignItems: 'center',
  },
  summaryCardProfile: {
    minWidth: 112,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryValue: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '900',
  },
  summaryValueProfile: {
    fontSize: 30,
  },
  summaryLabel: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bioPanel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
  },
  bio: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  statsBar: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statsText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});

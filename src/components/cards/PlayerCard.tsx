import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PLAYER_STATUS_LABELS, POSITION_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { Player } from '@/types/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';

interface PlayerCardProps {
  player: Player;
  statsLabel?: string;
  onPress?: () => void;
}

export function PlayerCard({ player, statsLabel, onPress }: PlayerCardProps) {
  const theme = useAppTheme();
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      {...(onPress ? { onPress } : {})}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <View style={styles.header}>
        <Avatar name={player.nickname} photoUrl={player.photoUrl} size={54} />
        <View style={styles.copy}>
          <Text style={[styles.name, { color: theme.colors.text }]}>
            #{player.jerseyNumber} {player.nickname}
          </Text>
          <Text style={[styles.fullName, { color: theme.colors.textMuted }]}>
            {player.fullName}
          </Text>
        </View>
        <Pill
          label={PLAYER_STATUS_LABELS[player.status]}
          color={player.status === 'active' ? theme.colors.success : theme.colors.warning}
        />
      </View>
      <Text style={[styles.position, { color: theme.colors.text }]}>
        {POSITION_LABELS[player.primaryPosition]}
      </Text>
      <Text style={[styles.secondary, { color: theme.colors.textMuted }]}>
        Secundarias:{' '}
        {player.secondaryPositions.length > 0
          ? player.secondaryPositions.map((position) => POSITION_LABELS[position]).join(', ')
          : 'Nao informadas'}
      </Text>
      {player.bio ? (
        <Text style={[styles.bio, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {player.bio}
        </Text>
      ) : null}
      {statsLabel ? (
        <Text style={[styles.stats, { color: theme.colors.secondary }]}>{statsLabel}</Text>
      ) : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  fullName: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  position: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  secondary: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  bio: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  stats: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateTimeBR } from '@/lib/date';
import { getMatchDiaryMoodMeta, resolveDiaryEmoji } from '@/lib/match-diary';
import type { MatchDiaryEntry, Player } from '@/types/domain';

interface MatchDiaryEntryCardProps {
  entry: MatchDiaryEntry;
  mentionedPlayers: Player[];
  onPressMention?: (playerId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function getMoodPalette(
  mood: MatchDiaryEntry['mood'],
  colors: ReturnType<typeof useAppTheme>['colors'],
) {
  switch (mood) {
    case 'highlight':
      return {
        glow: `${colors.warning}26`,
        accent: colors.warning,
        soft: `${colors.warning}16`,
      };
    case 'funny':
      return {
        glow: `${colors.secondary}24`,
        accent: colors.secondary,
        soft: `${colors.secondary}16`,
      };
    case 'warning':
      return {
        glow: `${colors.danger}22`,
        accent: colors.danger,
        soft: `${colors.danger}14`,
      };
    case 'praise':
      return {
        glow: `${colors.success}22`,
        accent: colors.success,
        soft: `${colors.success}14`,
      };
    case 'neutral':
    default:
      return {
        glow: `${colors.primary}20`,
        accent: colors.primary,
        soft: `${colors.primary}12`,
      };
  }
}

export function MatchDiaryEntryCard({
  entry,
  mentionedPlayers,
  onPressMention,
  onEdit,
  onDelete,
}: MatchDiaryEntryCardProps) {
  const theme = useAppTheme();
  const mood = getMatchDiaryMoodMeta(entry.mood);
  const emoji = resolveDiaryEmoji(entry.mood, entry.emoji) ?? mood.emoji;
  const palette = getMoodPalette(entry.mood, theme.colors);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: `${palette.accent}44`,
          shadowColor: palette.accent,
        },
      ]}>
      <LinearGradient
        colors={[palette.glow, palette.soft, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glow}
      />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: palette.accent }]}>
            {emoji} {mood.label}
          </Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {entry.title ?? 'Resenha da partida'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {entry.pinned ? (
            <View
              style={[
                styles.pinnedBadge,
                {
                  backgroundColor: `${palette.accent}18`,
                  borderColor: `${palette.accent}36`,
                },
              ]}>
              <Text style={[styles.pinnedText, { color: palette.accent }]}>Fixado</Text>
            </View>
          ) : null}
          {onEdit ? (
            <Pressable onPress={onEdit}>
              <Text style={[styles.actionText, { color: theme.colors.primary }]}>Editar</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable onPress={onDelete}>
              <Text style={[styles.actionText, { color: theme.colors.danger }]}>Excluir</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={[styles.content, { color: theme.colors.text }]}>{entry.content}</Text>

      {mentionedPlayers.length > 0 ? (
        <View style={styles.mentionsSection}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>Mencionados</Text>
          <View style={styles.chipsWrap}>
            {mentionedPlayers.map((player) => (
              <Pressable
                key={player.id}
                disabled={!onPressMention}
                onPress={() => onPressMention?.(player.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: theme.colors.backgroundElevated,
                    borderColor: `${palette.accent}34`,
                  },
                ]}>
                <Text style={[styles.chipText, { color: theme.colors.text }]}>
                  #{player.jerseyNumber} {player.nickname}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
          {entry.authorName}
        </Text>
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
          {formatDateTimeBR(entry.updatedAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  glow: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  kicker: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '900',
  },
  pinnedBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pinnedText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
  },
  actionText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
  },
  content: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
  },
  mentionsSection: {
    gap: 8,
  },
  metaLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
});

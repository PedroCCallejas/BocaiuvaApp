import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MATCH_STATUS_LABELS, MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMatchDateTime } from '@/lib/date';
import type { Match } from '@/types/domain';
import { Pill } from '@/components/ui/Pill';

interface MatchCardProps {
  match: Match;
  attendance?: {
    confirmed: number;
    absent: number;
    pending: number;
  };
  onPress?: () => void;
}

export function MatchCard({ match, attendance, onPress }: MatchCardProps) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{match.opponentName}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {formatMatchDateTime(match)} - {match.venue}
          </Text>
        </View>
        <Pill label={MATCH_STATUS_LABELS[match.status]} color={theme.colors.secondary} />
      </View>
      <View style={styles.tags}>
        <Pill label={MATCH_TYPE_LABELS[match.matchType]} />
        <Pill label={`${match.linePlayersCount + 1} em campo`} />
      </View>
      {match.scoreboard ? (
        <Text style={[styles.scoreboard, { color: theme.colors.text }]}>
          Seu time {match.scoreboard.team} x {match.scoreboard.opponent} {match.opponentName}
        </Text>
      ) : null}
      {attendance ? (
        <Text style={[styles.attendance, { color: theme.colors.textMuted }]}>
          {attendance.confirmed} confirmados - {attendance.absent} ausentes - {attendance.pending} pendentes
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scoreboard: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  attendance: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
});

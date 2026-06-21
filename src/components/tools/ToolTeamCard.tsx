import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';

import { ToolCard } from './ToolCard';
import { ToolPlayerChip } from './ToolPlayerChip';
import { TOOL_COLORS } from './tool-theme';

interface ToolTeamCardProps {
  title: string;
  subtitle?: string;
  players: string[];
  accentColor?: string;
}

export function ToolTeamCard({
  title,
  subtitle,
  players,
  accentColor = TOOL_COLORS.accent,
}: ToolTeamCardProps) {
  return (
    <ToolCard tone="field" style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.titlePill, { backgroundColor: accentColor }]}>
          <Text style={styles.title}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.players}>
        {players.map((player, index) => (
          <ToolPlayerChip
            key={`${title}-${player}-${index}`}
            prefix={String(index + 1)}
            label={player}
            accentColor={accentColor}
          />
        ))}
      </View>
    </ToolCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  header: {
    gap: 8,
  },
  titlePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
    color: TOOL_COLORS.background,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: TOOL_COLORS.textSoft,
  },
  players: {
    gap: 8,
  },
});

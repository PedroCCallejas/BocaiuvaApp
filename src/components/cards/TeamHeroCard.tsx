import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts } from '@/constants/theme';
import type { Team } from '@/types/domain';
import { Avatar } from '@/components/ui/Avatar';

interface TeamHeroCardProps {
  team: Team;
  modeLabel: string;
}

export function TeamHeroCard({ team, modeLabel }: TeamHeroCardProps) {
  const textColor = getReadableTextColor([team.primaryColor, team.secondaryColor]);
  const softTextColor = `${textColor}CC`;

  return (
    <LinearGradient
      colors={[team.primaryColor, team.secondaryColor]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={[styles.mode, { color: textColor }]}>{modeLabel}</Text>
          <Text style={[styles.badge, { color: softTextColor }]}>Futebol amador</Text>
        </View>
        <Avatar
          name={team.name}
          photoUrl={team.logoUrl}
          size={68}
          accent="rgba(255,255,255,0.18)"
        />
      </View>
      <Text style={[styles.name, { color: textColor }]}>{team.name}</Text>
      <Text style={[styles.coach, { color: softTextColor }]}>
        Responsavel: {team.coachName}
      </Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: textColor }]}>Elenco organizado</Text>
        <Text style={[styles.meta, { color: textColor }]}>Jogo mais bem preparado</Text>
      </View>
    </LinearGradient>
  );
}

function getReadableTextColor(colors: string[]) {
  const averageLuminance =
    colors.reduce((sum, color) => sum + getLuminance(color), 0) / colors.length;

  return averageLuminance > 0.58 ? '#08120E' : '#F7FBF8';
}

function getLuminance(color: string) {
  const normalized = color.replace('#', '');
  const hex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((value) => `${value}${value}`)
          .join('')
      : normalized;

  const red = parseInt(hex.slice(0, 2), 16) / 255;
  const green = parseInt(hex.slice(2, 4), 16) / 255;
  const blue = parseInt(hex.slice(4, 6), 16) / 255;

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

const styles = StyleSheet.create({
  gradient: {
    borderRadius: 28,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  mode: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  badge: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: '900',
  },
  coach: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  meta: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
});

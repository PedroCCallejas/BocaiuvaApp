import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { fonts } from '@/constants/theme';
import type { Team } from '@/types/domain';

interface TeamHeroCardProps {
  team: Team;
  modeLabel: string;
}

const heroText = '#F7FBF8';
const heroTextMuted = 'rgba(247,251,248,0.8)';

export function TeamHeroCard({ team, modeLabel }: TeamHeroCardProps) {
  const accent = team.accentColor ?? team.secondaryColor;

  return (
    <View style={styles.shell}>
      {team.bannerUrl ? (
        <Image source={{ uri: team.bannerUrl }} resizeMode="cover" style={styles.banner} />
      ) : team.logoUrl ? (
        <Image source={{ uri: team.logoUrl }} resizeMode="contain" style={styles.watermark} />
      ) : null}

      <LinearGradient
        colors={[`${team.primaryColor}F4`, `${team.secondaryColor}D9`, `${team.primaryColor}FA`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}>
        <LinearGradient
          colors={['rgba(4,10,8,0.12)', 'rgba(4,10,8,0.48)', 'rgba(4,10,8,0.86)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.overlay}
        />

        <View
          style={[
            styles.orb,
            {
              backgroundColor: `${accent}1F`,
              borderColor: `${accent}66`,
            },
          ]}
        />

        <View style={styles.topRow}>
          <View style={styles.topCopy}>
            <View style={styles.modePill}>
              <Text style={styles.mode}>{modeLabel}</Text>
            </View>
            <Text style={styles.kicker}>Identidade do elenco</Text>
          </View>

          <View
            style={[
              styles.logoFrame,
              {
                borderColor: 'rgba(255,255,255,0.24)',
                shadowColor: accent,
              },
            ]}>
            <Avatar
              name={team.name}
              photoUrl={team.logoUrl}
              size={104}
              accent="rgba(255,255,255,0.16)"
            />
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.name}>{team.name}</Text>
          <Text style={styles.coach}>Responsavel: {team.coachName}</Text>
          {team.description ? (
            <Text numberOfLines={2} style={styles.description}>
              {team.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <HeroTag label="Futebol amador" />
          <HeroTag label="Escudo em destaque" />
          <HeroTag label="Time organizado" />
        </View>
      </LinearGradient>
    </View>
  );
}

function HeroTag({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  banner: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.36,
  },
  watermark: {
    position: 'absolute',
    right: -26,
    bottom: -14,
    width: 210,
    height: 210,
    opacity: 0.14,
  },
  gradient: {
    minHeight: 240,
    padding: 22,
    gap: 18,
    justifyContent: 'space-between',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    top: -36,
    right: -20,
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  topCopy: {
    flex: 1,
    gap: 10,
  },
  modePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  mode: {
    color: heroText,
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  kicker: {
    color: heroTextMuted,
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  logoFrame: {
    padding: 8,
    borderRadius: 34,
    borderWidth: 1,
    backgroundColor: 'rgba(5,12,9,0.22)',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  titleBlock: {
    gap: 8,
    maxWidth: '78%',
  },
  name: {
    color: heroText,
    fontFamily: fonts.display,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 40,
  },
  coach: {
    color: heroText,
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    color: heroTextMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  meta: {
    color: heroText,
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
});

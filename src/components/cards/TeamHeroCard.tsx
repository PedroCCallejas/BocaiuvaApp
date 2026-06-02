import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { fonts } from '@/constants/theme';

interface TeamHeroIdentity {
  name: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
}

interface TeamHeroCardProps {
  team: TeamHeroIdentity;
  modeLabel?: string;
  locationLabel?: string | null;
  description?: string | null;
  supportingText?: string | null;
  compact?: boolean;
  children?: ReactNode;
}

const heroText = '#F7FBF8';
const heroTextMuted = 'rgba(247,251,248,0.82)';

function buildLocationLabel(team: TeamHeroIdentity) {
  if (!team.city?.trim()) {
    return null;
  }

  return [team.city.trim(), team.state?.trim()].filter(Boolean).join(', ');
}

export function TeamHeroCard({
  team,
  modeLabel,
  locationLabel,
  description,
  supportingText,
  compact = false,
  children,
}: TeamHeroCardProps) {
  const hasBanner = Boolean(team.bannerUrl);
  const accent = team.accentColor ?? team.secondaryColor;
  const resolvedLocationLabel = locationLabel ?? buildLocationLabel(team);
  const resolvedDescription = description ?? team.description ?? null;
  const logoSize = compact ? 96 : 118;

  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={[`${team.primaryColor}F5`, `${team.secondaryColor}D6`, `${team.primaryColor}FA`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, compact ? styles.compactGradient : null]}>
        {team.bannerUrl ? (
          <Image source={{ uri: team.bannerUrl }} resizeMode="cover" style={styles.banner} />
        ) : team.logoUrl ? (
          <Image source={{ uri: team.logoUrl }} resizeMode="contain" style={styles.watermark} />
        ) : null}

        <LinearGradient
          colors={['rgba(4,10,8,0.16)', 'rgba(4,10,8,0.54)', 'rgba(4,10,8,0.9)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.overlay}
        />

        {!hasBanner ? (
          <View
            style={[
              styles.lightOrb,
              {
                backgroundColor: `${accent}16`,
                borderColor: `${accent}38`,
              },
            ]}
          />
        ) : null}

        <View style={styles.content}>
          {modeLabel ? (
            <View style={styles.modePill}>
              <Text style={styles.mode}>{modeLabel}</Text>
            </View>
          ) : null}

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
              size={logoSize}
              accent="rgba(255,255,255,0.16)"
            />
          </View>

          <View style={styles.identityBlock}>
            <Text style={styles.name}>{team.name}</Text>
            {resolvedLocationLabel ? (
              <Text style={styles.location}>{resolvedLocationLabel}</Text>
            ) : null}
            {resolvedDescription ? (
              <Text numberOfLines={compact ? 3 : 4} style={styles.description}>
                {resolvedDescription}
              </Text>
            ) : null}
            {supportingText ? (
              <Text style={styles.supportingText}>{supportingText}</Text>
            ) : null}
          </View>

          {children ? <View style={styles.footer}>{children}</View> : null}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  gradient: {
    minHeight: 348,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  compactGradient: {
    minHeight: 300,
  },
  banner: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.94,
  },
  watermark: {
    position: 'absolute',
    right: -18,
    bottom: -12,
    width: 210,
    height: 210,
    opacity: 0.14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  lightOrb: {
    position: 'absolute',
    top: -34,
    right: -12,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    opacity: 0.7,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  modePill: {
    alignSelf: 'center',
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
  logoFrame: {
    padding: 10,
    borderRadius: 40,
    borderWidth: 1,
    backgroundColor: 'rgba(5,12,9,0.24)',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  identityBlock: {
    maxWidth: 760,
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: heroText,
    fontFamily: fonts.display,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 42,
    textAlign: 'center',
  },
  location: {
    color: heroText,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  description: {
    color: heroTextMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  supportingText: {
    color: 'rgba(255,255,255,0.74)',
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  footer: {
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
});

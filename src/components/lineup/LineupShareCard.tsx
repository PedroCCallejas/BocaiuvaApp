import { useMemo } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts } from '@/constants/theme';
import type { LineupNode, Player } from '@/types/domain';

interface LineupShareCardProps {
  teamName: string;
  teamLogoUrl?: string | null;
  opponentName: string;
  matchLabel?: string | null;
  starters: LineupNode[];
  benchPlayerIds: string[];
  players: Player[];
  colors: {
    primary: string;
    secondary: string;
    accent?: string | null;
  };
}

const TOKEN_SIZE = 68;

export function LineupShareCard({
  teamName,
  teamLogoUrl,
  opponentName,
  matchLabel,
  starters,
  benchPlayerIds,
  players,
  colors,
}: LineupShareCardProps) {
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const accent = colors.accent?.trim() || '#F4C542';
  const crestText = pickContrastText(accent);
  const shouldRenderLogo =
    Boolean(teamLogoUrl) &&
    (
      Platform.OS !== 'web' ||
      teamLogoUrl?.startsWith('data:image/') ||
      teamLogoUrl?.startsWith('blob:')
    );
  const benchPlayers = benchPlayerIds
    .map((playerId) => playerById.get(playerId))
    .filter((player): player is Player => Boolean(player));
  const visibleStarters = starters
    .map((node) => ({ node, player: playerById.get(node.playerId) }))
    .filter(
      (item): item is { node: LineupNode; player: Player } => Boolean(item.player),
    );

  return (
    <LinearGradient
      colors={[colors.primary, mixColor(colors.primary, colors.secondary, 0.55), colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text numberOfLines={2} style={styles.teamName}>
            {teamName}
          </Text>
          <Text numberOfLines={2} style={styles.matchTitle}>
            {opponentName}
          </Text>
          {matchLabel ? (
            <Text numberOfLines={2} style={styles.matchLabel}>
              {matchLabel}
            </Text>
          ) : null}
        </View>

        <View style={[styles.crest, { backgroundColor: accent }]}>
          {shouldRenderLogo ? (
            <Image source={{ uri: teamLogoUrl ?? undefined }} resizeMode="contain" style={styles.crestImage} />
          ) : (
            <Text style={[styles.crestText, { color: crestText }]}>
              {buildInitials(teamName)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.fieldShell}>
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fieldGlow}
        />

        <View style={styles.field}>
          <View style={styles.pitchStripeLeft} />
          <View style={styles.pitchStripeRight} />
          <View style={styles.centerLine} />
          <View style={styles.centerCircle} />
          <View style={styles.boxTop} />
          <View style={styles.boxBottom} />

          {visibleStarters.map(({ node, player }) => {
            const label = node.label?.trim() || player.nickname;

            return (
              <View
                key={player.id}
                style={[
                  styles.token,
                  {
                    left: `${clamp(node.x, 8, 92)}%`,
                    top: `${clamp(node.y, 10, 90)}%`,
                    marginLeft: -(TOKEN_SIZE / 2),
                    marginTop: -(TOKEN_SIZE / 2),
                    backgroundColor: 'rgba(8,20,12,0.82)',
                    borderColor: accent,
                  },
                ]}
              >
                <View style={[styles.tokenBadge, { backgroundColor: accent }]}>
                  <Text style={[styles.tokenBadgeText, { color: crestText }]}>
                    {player.jerseyNumber}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.tokenName}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.benchSection}>
        <Text style={styles.sectionLabel}>Banco</Text>
        <View style={styles.benchWrap}>
          {benchPlayers.length === 0 ? (
            <View style={styles.emptyBenchChip}>
              <Text style={styles.emptyBenchText}>Sem reservas nesta arte.</Text>
            </View>
          ) : (
            benchPlayers.map((player) => (
              <View key={player.id} style={styles.benchChip}>
                <Text style={styles.benchNumber}>#{player.jerseyNumber}</Text>
                <Text numberOfLines={1} style={styles.benchName}>
                  {player.nickname}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      <Text style={styles.watermark}>Gerado no Professo FC</Text>
    </LinearGradient>
  );
}

function buildInitials(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return 'PF';
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');

  return initials.join('') || normalized.slice(0, 2).toUpperCase();
}

function pickContrastText(color: string) {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) {
    return '#F5F7F6';
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#102118' : '#F5F7F6';
}

function mixColor(left: string, right: string, ratio: number) {
  const safeRatio = clamp(ratio, 0, 1);
  const [lr, lg, lb] = hexToRgb(left);
  const [rr, rg, rb] = hexToRgb(right);

  return `rgb(${Math.round(lr + (rr - lr) * safeRatio)}, ${Math.round(lg + (rg - lg) * safeRatio)}, ${Math.round(lb + (rb - lb) * safeRatio)})`;
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) {
    return [14, 138, 67];
  }

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 1080 / 1350,
    borderRadius: 28,
    padding: 20,
    gap: 16,
    overflow: 'hidden',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  teamName: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: '900',
    color: '#F7FBF8',
  },
  matchTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    color: '#F7FBF8',
  },
  matchLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(247,251,248,0.82)',
  },
  crest: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  crestImage: {
    width: '72%',
    height: '72%',
  },
  crestText: {
    fontFamily: fonts.heading,
    fontSize: 24,
    fontWeight: '900',
  },
  fieldShell: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(7,22,12,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  fieldGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  field: {
    flex: 1,
    backgroundColor: 'rgba(16,110,53,0.84)',
  },
  pitchStripeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '32%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pitchStripeRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '32%',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  centerLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  centerCircle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 112,
    height: 112,
    marginLeft: -56,
    marginTop: -56,
    borderRadius: 56,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  boxTop: {
    position: 'absolute',
    top: 0,
    left: '23%',
    width: '54%',
    height: 84,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  boxBottom: {
    position: 'absolute',
    bottom: 0,
    left: '23%',
    width: '54%',
    height: 84,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  token: {
    position: 'absolute',
    width: TOKEN_SIZE,
    minHeight: TOKEN_SIZE,
    borderRadius: 20,
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tokenBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tokenBadgeText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '900',
  },
  tokenName: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
    textAlign: 'center',
    color: '#F7FBF8',
  },
  benchSection: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
    color: '#F7FBF8',
  },
  benchWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  benchChip: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(6,14,9,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benchNumber: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '900',
    color: '#F4C542',
  },
  benchName: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: '#F7FBF8',
  },
  emptyBenchChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(6,14,9,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  emptyBenchText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: 'rgba(247,251,248,0.82)',
  },
  watermark: {
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: 'right',
    color: 'rgba(247,251,248,0.72)',
  },
});

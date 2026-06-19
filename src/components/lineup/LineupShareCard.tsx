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

const TOKEN_SIZE = 64;
const BENCH_PHOTO_SIZE = 28;
const MAX_BENCH_DISPLAY = 6;

// Estimated field pixel dimensions at export (1080×1350 card, padding 18, compact header/bench)
const FIELD_W_EST = 1044;
const FIELD_H_EST = 920;
const TOKEN_MIN_DIST = TOKEN_SIZE + 8;

function deconflictPositions(
  nodes: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (nodes.length < 2) return nodes;
  const pos = nodes.map((n) => ({ x: n.x, y: n.y }));
  for (let iter = 0; iter < 24; iter++) {
    let maxMove = 0;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dxPx = ((pos[j].x - pos[i].x) / 100) * FIELD_W_EST;
        const dyPx = ((pos[j].y - pos[i].y) / 100) * FIELD_H_EST;
        const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
        if (distPx > 0 && distPx < TOKEN_MIN_DIST) {
          const push = ((TOKEN_MIN_DIST - distPx) / 2 + 0.5) * 0.8;
          const nx = dxPx / distPx;
          const ny = dyPx / distPx;
          pos[i].x -= (push * nx / FIELD_W_EST) * 100;
          pos[i].y -= (push * ny / FIELD_H_EST) * 100;
          pos[j].x += (push * nx / FIELD_W_EST) * 100;
          pos[j].y += (push * ny / FIELD_H_EST) * 100;
          pos[i].x = clamp(pos[i].x, 7, 93);
          pos[i].y = clamp(pos[i].y, 6, 94);
          pos[j].x = clamp(pos[j].x, 7, 93);
          pos[j].y = clamp(pos[j].y, 6, 94);
          maxMove = Math.max(maxMove, push);
        }
      }
    }
    if (maxMove < 0.2) break;
  }
  return pos;
}

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

  const shouldRenderLogo = Boolean(teamLogoUrl);

  const benchPlayers = benchPlayerIds
    .slice(0, MAX_BENCH_DISPLAY)
    .map((playerId) => playerById.get(playerId))
    .filter((player): player is Player => Boolean(player));

  const visibleStarters = starters
    .map((node) => ({ node, player: playerById.get(node.playerId) }))
    .filter(
      (item): item is { node: LineupNode; player: Player } => Boolean(item.player),
    );

  const adjustedPositions = useMemo(
    () => deconflictPositions(visibleStarters.map(({ node }) => ({ x: node.x, y: node.y }))),
    [visibleStarters],
  );

  return (
    <LinearGradient
      colors={[colors.primary, mixColor(colors.primary, colors.secondary, 0.55), colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* ── Header ── */}
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text numberOfLines={2} style={styles.teamName}>
            {teamName}
          </Text>
          <Text numberOfLines={2} style={styles.matchTitle}>
            vs {opponentName}
          </Text>
          {matchLabel ? (
            <Text numberOfLines={1} style={styles.matchLabel}>
              {matchLabel}
            </Text>
          ) : null}
        </View>

        <View style={[styles.crest, { backgroundColor: accent }]}>
          {shouldRenderLogo ? (
            <Image
              source={{ uri: teamLogoUrl ?? undefined }}
              resizeMode="contain"
              style={styles.crestImage}
            />
          ) : (
            <Text style={[styles.crestText, { color: crestText }]}>
              {buildInitials(teamName)}
            </Text>
          )}
        </View>
      </View>

      {/* ── Campo ── */}
      <View style={styles.fieldShell}>
        <LinearGradient
          colors={['rgba(11,94,45,0.95)', 'rgba(7,62,30,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Decorações do campo */}
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <View style={styles.pitchStripeLeft} />
          <View style={styles.pitchStripeRight} />
          <View style={styles.centerLine} />
          <View style={styles.centerCircle} />
          <View style={styles.boxTop} />
          <View style={styles.boxBottom} />
          <View style={styles.goalTop} />
          <View style={styles.goalBottom} />
        </View>

        {/* Watermark logo no campo */}
        {shouldRenderLogo && Platform.OS !== 'web' ? (
          <Image
            source={{ uri: teamLogoUrl ?? undefined }}
            resizeMode="contain"
            style={styles.fieldLogoWatermark}
          />
        ) : null}

        {/* Tokens dos titulares — posições ajustadas para evitar sobreposição */}
        {visibleStarters.map(({ node, player }, index) => {
          const label = node.label?.trim() || player.nickname;
          const hasPhoto = Boolean(player.photoUrl);
          const adj = adjustedPositions[index] ?? { x: node.x, y: node.y };

          return (
            <View
              key={player.id}
              style={[
                styles.token,
                {
                  left: `${clamp(adj.x, 7, 93)}%`,
                  top: `${clamp(adj.y, 6, 94)}%`,
                  marginLeft: -(TOKEN_SIZE / 2),
                  marginTop: -(TOKEN_SIZE / 2),
                  borderColor: accent,
                },
              ]}
            >
              {hasPhoto ? (
                <Image
                  source={{ uri: player.photoUrl ?? undefined }}
                  style={styles.tokenPhoto}
                />
              ) : (
                <LinearGradient
                  colors={[colors.primary, mixColor(colors.primary, colors.secondary, 0.6)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}

              <LinearGradient
                colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />

              {!hasPhoto ? (
                <View style={styles.tokenInitialsWrap}>
                  <Text style={styles.tokenInitialsText}>
                    {buildInitials(player.nickname)}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.tokenBadge, { backgroundColor: accent }]}>
                <Text style={[styles.tokenBadgeText, { color: crestText }]}>
                  {player.jerseyNumber}
                </Text>
              </View>

              <View style={styles.tokenNameWrap}>
                <Text numberOfLines={1} style={styles.tokenName}>
                  {label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Banco ── */}
      {benchPlayers.length > 0 ? (
        <View style={styles.benchSection}>
          <Text style={styles.sectionLabel}>Banco</Text>
          <View style={styles.benchWrap}>
            {benchPlayers.map((player) => {
              const hasPhoto = Boolean(player.photoUrl);
              return (
                <View key={player.id} style={styles.benchChip}>
                  <View style={styles.benchPhotoWrap}>
                    {hasPhoto ? (
                      <Image
                        source={{ uri: player.photoUrl ?? undefined }}
                        style={styles.benchPhoto}
                      />
                    ) : (
                      <LinearGradient
                        colors={[colors.primary, mixColor(colors.primary, colors.secondary, 0.5)]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                    )}
                    {!hasPhoto ? (
                      <Text style={styles.benchInitialsText}>
                        {buildInitials(player.nickname)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.benchChipText}>
                    <Text style={[styles.benchNumber, { color: accent }]}>
                      #{player.jerseyNumber}
                    </Text>
                    <Text numberOfLines={1} style={styles.benchName}>
                      {player.nickname}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text style={styles.watermark}>Gerado no Professô FC</Text>
    </LinearGradient>
  );
}

function buildInitials(value: string) {
  const normalized = value.trim();
  if (!normalized) return 'PF';
  const parts = normalized.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return initials.join('') || normalized.slice(0, 2).toUpperCase();
}

function pickContrastText(color: string) {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) return '#F5F7F6';
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
  if (normalized.length !== 6) return [14, 138, 67];
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
    padding: 18,
    gap: 12,
    overflow: 'hidden',
  },

  // Header
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
  },
  teamName: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '900',
    color: '#F7FBF8',
  },
  matchTitle: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(247,251,248,0.9)',
  },
  matchLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 14,
    color: 'rgba(247,251,248,0.72)',
  },
  crest: {
    width: 60,
    height: 60,
    borderRadius: 18,
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
    fontSize: 20,
    fontWeight: '900',
  },

  // Field
  fieldShell: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pitchStripeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '32%',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pitchStripeRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '32%',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  centerLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  centerCircle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 100,
    height: 100,
    marginLeft: -50,
    marginTop: -50,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  boxTop: {
    position: 'absolute',
    top: 0,
    left: '22%',
    width: '56%',
    height: 72,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  boxBottom: {
    position: 'absolute',
    bottom: 0,
    left: '22%',
    width: '56%',
    height: 72,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  goalTop: {
    position: 'absolute',
    top: 0,
    left: '39%',
    width: '22%',
    height: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  goalBottom: {
    position: 'absolute',
    bottom: 0,
    left: '39%',
    width: '22%',
    height: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  fieldLogoWatermark: {
    position: 'absolute',
    top: '23%',
    left: '24%',
    width: '52%',
    height: '52%',
    opacity: 0.07,
  },

  // Token
  token: {
    position: 'absolute',
    width: TOKEN_SIZE,
    height: TOKEN_SIZE,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tokenPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  tokenInitialsWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 14,
  },
  tokenInitialsText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.7)',
  },
  tokenBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    zIndex: 3,
  },
  tokenBadgeText: {
    fontFamily: fonts.heading,
    fontSize: 9,
    fontWeight: '900',
  },
  tokenNameWrap: {
    paddingHorizontal: 5,
    paddingBottom: 5,
  },
  tokenName: {
    fontFamily: fonts.heading,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    color: '#F7FBF8',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Bench
  benchSection: {
    gap: 6,
  },
  sectionLabel: {
    fontFamily: fonts.heading,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(247,251,248,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  benchWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  benchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(6,14,9,0.50)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  benchPhotoWrap: {
    width: BENCH_PHOTO_SIZE,
    height: BENCH_PHOTO_SIZE,
    borderRadius: BENCH_PHOTO_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,20,14,0.6)',
  },
  benchPhoto: {
    width: BENCH_PHOTO_SIZE,
    height: BENCH_PHOTO_SIZE,
    borderRadius: BENCH_PHOTO_SIZE / 2,
  },
  benchInitialsText: {
    fontFamily: fonts.heading,
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.7)',
    zIndex: 1,
  },
  benchChipText: {
    gap: 0,
  },
  benchNumber: {
    fontFamily: fonts.heading,
    fontSize: 9,
    fontWeight: '900',
  },
  benchName: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: '#F7FBF8',
    maxWidth: 72,
  },

  // Watermark
  watermark: {
    fontFamily: fonts.body,
    fontSize: 9,
    textAlign: 'right',
    color: 'rgba(247,251,248,0.55)',
  },
});

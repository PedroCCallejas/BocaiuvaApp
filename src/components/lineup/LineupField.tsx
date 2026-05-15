import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PanResponderGestureState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { inferLineupZone } from '@/lib/lineup';
import type { LineupNode, Player } from '@/types/domain';

interface LineupFieldProps {
  starters: LineupNode[];
  benchPlayerIds: string[];
  players: Player[];
  starterLimit: number;
  teamName: string;
  teamLogoUrl?: string | null;
  editable?: boolean;
  onChange: (next: { starters: LineupNode[]; benchPlayerIds: string[] }) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

interface PixelPosition {
  left: number;
  top: number;
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export function LineupField({
  starters,
  benchPlayerIds,
  players,
  starterLimit,
  teamName,
  teamLogoUrl,
  editable = true,
  onChange,
  onDragStateChange,
}: LineupFieldProps) {
  const theme = useAppTheme();
  const [fieldWidth, setFieldWidth] = useState(320);

  const nodeSize = resolveNodeSize(fieldWidth);
  const benchNodeSize = Math.max(nodeSize - 12, 62);
  const fieldHeight = resolveFieldHeight(fieldWidth);
  const benchTop = fieldHeight + 18;
  const benchHeight = benchNodeSize + 84;
  const totalHeight = benchTop + benchHeight;

  const startersRef = useLatestRef(starters);
  const benchPlayerIdsRef = useLatestRef(benchPlayerIds);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const commit = useCallback(
    (nextStarters: LineupNode[], nextBenchPlayerIds: string[]) => {
      onChange({
        starters: nextStarters,
        benchPlayerIds: nextBenchPlayerIds,
      });
    },
    [onChange],
  );

  const updateStarterPosition = useCallback(
    (playerId: string, center: { x: number; y: number }) => {
      if (!editable) {
        return;
      }

      const x = Number(((center.x / fieldWidth) * 100).toFixed(1));
      const y = Number(((center.y / fieldHeight) * 100).toFixed(1));

      commit(
        startersRef.current.map((node) =>
          node.playerId === playerId
            ? {
                ...node,
                x,
                y,
                zone: inferLineupZone(y),
              }
            : node,
        ),
        benchPlayerIdsRef.current,
      );
    },
    [benchPlayerIdsRef, commit, editable, fieldHeight, fieldWidth, startersRef],
  );

  const removeStarterToBench = useCallback(
    (playerId: string) => {
      if (!editable) {
        return;
      }

      const currentStarters = startersRef.current;
      const currentBenchPlayerIds = benchPlayerIdsRef.current;

      if (currentBenchPlayerIds.includes(playerId)) {
        return;
      }

      commit(
        currentStarters.filter((node) => node.playerId !== playerId),
        [...currentBenchPlayerIds, playerId],
      );
    },
    [benchPlayerIdsRef, commit, editable, startersRef],
  );

  const addBenchPlayerToField = useCallback(
    (playerId: string) => {
      if (!editable) {
        return;
      }

      const currentStarters = startersRef.current;
      const currentBenchPlayerIds = benchPlayerIdsRef.current;

      if (currentStarters.some((node) => node.playerId === playerId)) {
        return;
      }

      if (currentStarters.length >= starterLimit) {
        Alert.alert(
          'Campo cheio',
          'Remova um jogador do campo antes de adicionar outro.',
        );
        return;
      }

      const position = getNextStarterPosition(currentStarters);

      commit(
        [
          ...currentStarters,
          {
            playerId,
            x: position.x,
            y: position.y,
            zone: inferLineupZone(position.y),
            label: null,
          },
        ],
        currentBenchPlayerIds.filter((benchPlayerId) => benchPlayerId !== playerId),
      );
    },
    [benchPlayerIdsRef, commit, editable, starterLimit, startersRef],
  );

  const handleFieldPlayerPress = useCallback(
    (playerId: string) => {
      if (!editable) {
        return;
      }

      const player = playerById.get(playerId);

      if (!player) {
        return;
      }

      Alert.alert(
        `${player.nickname} #${player.jerseyNumber}`,
        player.fullName,
        [
          { text: 'Fechar', style: 'cancel' },
          {
            text: 'Remover do campo',
            style: 'destructive',
            onPress: () => removeStarterToBench(playerId),
          },
        ],
      );
    },
    [editable, playerById, removeStarterToBench],
  );

  const handleBenchPlayerPress = useCallback(
    (playerId: string) => {
      if (!editable) {
        return;
      }

      const player = playerById.get(playerId);

      if (!player) {
        return;
      }

      Alert.alert(
        `${player.nickname} #${player.jerseyNumber}`,
        'Adicionar este jogador ao campo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Adicionar ao campo',
            onPress: () => addBenchPlayerToField(playerId),
          },
        ],
      );
    },
    [addBenchPlayerToField, editable, playerById],
  );

  const MAX_FIELD_WIDTH = 560;

const handleLayout = useCallback((width: number) => {
  const nextWidth = Math.min(Math.max(width - 20, 280), MAX_FIELD_WIDTH);

  setFieldWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
}, []);

  const rootSize = useMemo(
    () => ({
      width: fieldWidth,
      height: fieldHeight,
    }),
    [fieldHeight, fieldWidth],
  );

  return (
    <View
      style={[
        styles.shell,
        {
          borderColor: `${theme.colors.accent}44`,
          backgroundColor: theme.colors.surface,
          height: totalHeight + 12,
        },
      ]}
      onLayout={(event) => handleLayout(event.nativeEvent.layout.width)}
    >
      <LinearGradient
        colors={[`${theme.colors.primary}66`, theme.colors.fieldStripe, theme.colors.field]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.field, { height: fieldHeight }]}
      >
        {teamLogoUrl ? (
          <Image
            source={{ uri: teamLogoUrl }}
            resizeMode="contain"
            style={styles.logoWatermark}
          />
        ) : null}

        <View pointerEvents="none" style={styles.patternWrap}>
          <View
            style={[
              styles.stripe,
              styles.stripeLeft,
              { backgroundColor: 'rgba(255,255,255,0.04)' },
            ]}
          />
          <View
            style={[
              styles.stripe,
              styles.stripeRight,
              { backgroundColor: 'rgba(255,255,255,0.05)' },
            ]}
          />
          <View style={[styles.centerLine, { backgroundColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.circle, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.boxTop, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.boxBottom, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.goalTop, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.goalBottom, { borderColor: `${theme.colors.secondary}55` }]} />
        </View>

        {starters.map((node) => {
          const player = playerById.get(node.playerId);

          if (!player) {
            return null;
          }

          return (
            <MemoDraggableFieldToken
              key={`field-${node.playerId}`}
              player={player}
              label={node.label}
              initialPosition={toFieldPixels(node, fieldWidth, fieldHeight, nodeSize)}
              nodeSize={nodeSize}
              containerSize={rootSize}
              editable={editable}
              onMove={updateStarterPosition}
              onPress={handleFieldPlayerPress}
              onDragStateChange={onDragStateChange}
            />
          );
        })}
      </LinearGradient>

      <View
        style={[
          styles.benchPanel,
          {
            top: benchTop,
            height: benchHeight,
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: `${theme.colors.primary}33`,
          },
        ]}
      >
        <Text style={[styles.benchTitle, { color: theme.colors.text }]}>
          Banco de {teamName}
        </Text>

        <Text style={[styles.benchHint, { color: theme.colors.textMuted }]}>
          {editable
            ? 'Toque em um reserva para adicionar ao campo. Sem drag no banco.'
            : 'Escalacao em modo visualizacao.'}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.benchScrollContent}
        >
          {benchPlayerIds.length === 0 ? (
            <View style={styles.emptyBench}>
              <Text style={[styles.emptyBenchText, { color: theme.colors.textMuted }]}>
                Sem reservas nesta escalacao.
              </Text>
            </View>
          ) : (
            benchPlayerIds.map((playerId) => {
              const player = playerById.get(playerId);

              if (!player) {
                return null;
              }

              return (
                <BenchPlayerCard
                  key={`bench-${playerId}`}
                  player={player}
                  nodeSize={benchNodeSize}
                  editable={editable}
                  onPress={() => handleBenchPlayerPress(playerId)}
                />
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function DraggableFieldToken({
  player,
  label,
  initialPosition,
  nodeSize,
  containerSize,
  editable = true,
  onMove,
  onPress,
  onDragStateChange,
}: {
  player: Player;
  label?: string | null;
  initialPosition: PixelPosition;
  nodeSize: number;
  containerSize: { width: number; height: number };
  editable?: boolean;
  onMove: (playerId: string, center: { x: number; y: number }) => void;
  onPress: (playerId: string) => void;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const theme = useAppTheme();

  const [position, setPosition] = useState(initialPosition);
  const [dragging, setDragging] = useState(false);

  const draggingRef = useRef(false);
  const startRef = useRef(initialPosition);
  const initialPositionRef = useRef(initialPosition);
  const latestPositionRef = useRef(initialPosition);
  const movedRef = useRef(false);

  const moveRef = useLatestRef(onMove);
  const pressRef = useLatestRef(onPress);
  const dragStateRef = useLatestRef(onDragStateChange);
  const nodeSizeRef = useLatestRef(nodeSize);
  const containerRef = useLatestRef(containerSize);
  const playerIdRef = useLatestRef(player.id);
  const editableRef = useLatestRef(editable);

  useEffect(() => {
    latestPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    initialPositionRef.current = initialPosition;

    if (!draggingRef.current) {
      startRef.current = initialPosition;
      latestPositionRef.current = initialPosition;
      setPosition(initialPosition);
    }
  }, [initialPosition]);

  const finishDrag = useCallback(
    (gesture: PanResponderGestureState) => {
      if (!editableRef.current) {
        return;
      }

      const currentNodeSize = nodeSizeRef.current;
      const currentContainer = containerRef.current;

      const left = clamp(
        startRef.current.left + gesture.dx,
        0,
        currentContainer.width - currentNodeSize,
      );

      const top = clamp(
        startRef.current.top + gesture.dy,
        0,
        currentContainer.height - currentNodeSize,
      );

      const finalPosition = {
        left,
        top,
      };

      draggingRef.current = false;
      dragStateRef.current?.(false);
      setDragging(false);

      setPosition(finalPosition);
      startRef.current = finalPosition;
      latestPositionRef.current = finalPosition;
      initialPositionRef.current = finalPosition;

      if (!movedRef.current) {
        pressRef.current(playerIdRef.current);
        return;
      }

      moveRef.current(playerIdRef.current, {
        x: left + currentNodeSize / 2,
        y: top + currentNodeSize / 2,
      });
    },
    [containerRef, dragStateRef, editableRef, moveRef, nodeSizeRef, playerIdRef, pressRef],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(editableRef.current),
        onMoveShouldSetPanResponder: (_, gesture) =>
          Boolean(editableRef.current) &&
          (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          if (!editableRef.current) {
            return;
          }

          draggingRef.current = true;
          movedRef.current = false;
          setDragging(true);
          startRef.current = latestPositionRef.current;
          dragStateRef.current?.(true);
        },
        onPanResponderMove: (_, gesture) => {
          if (!editableRef.current) {
            return;
          }

          const currentNodeSize = nodeSizeRef.current;
          const currentContainer = containerRef.current;

          const nextLeft = clamp(
            startRef.current.left + gesture.dx,
            0,
            currentContainer.width - currentNodeSize,
          );

          const nextTop = clamp(
            startRef.current.top + gesture.dy,
            0,
            currentContainer.height - currentNodeSize,
          );

          if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) {
            movedRef.current = true;
          }

          setPosition({
            left: nextLeft,
            top: nextTop,
          });
        },
        onPanResponderRelease: (_, gesture) => finishDrag(gesture),
        onPanResponderTerminate: (_, gesture) => finishDrag(gesture),
      }),
    [containerRef, dragStateRef, editableRef, finishDrag, nodeSizeRef],
  );

  const labelColor = pickContrastText(theme.colors.primary);
  const accentColor = pickContrastText(theme.colors.accent);

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.fieldNode,
        {
          left: position.left,
          top: position.top,
          width: nodeSize,
          minHeight: nodeSize,
          backgroundColor: theme.colors.primary,
          borderColor: dragging ? theme.colors.accent : `${theme.colors.secondary}AA`,
          shadowColor: theme.colors.accent,
          shadowOpacity: dragging ? 0.38 : 0.18,
          shadowRadius: dragging ? 14 : 8,
          shadowOffset: { width: 0, height: dragging ? 10 : 4 },
          elevation: dragging ? 10 : 4,
          transform: [{ scale: dragging ? 1.04 : 1 }],
          zIndex: dragging ? 30 : 10,
          opacity: editable ? 1 : 0.96,
        },
      ]}
    >
      <View style={[styles.numberBadge, { backgroundColor: theme.colors.accent }]}>
        <Text style={[styles.numberText, { color: accentColor }]}>
          {player.jerseyNumber}
        </Text>
      </View>

      <Avatar
        name={player.nickname}
        photoUrl={player.photoUrl}
        size={nodeSize < 80 ? 30 : 34}
        accent={`${theme.colors.secondary}33`}
      />

      <Text numberOfLines={1} style={[styles.nodeName, { color: labelColor }]}>
        {label?.trim() || player.nickname}
      </Text>
    </View>
  );
}

const MemoDraggableFieldToken = memo(
  DraggableFieldToken,
  (prev, next) =>
    prev.player.id === next.player.id &&
    prev.player.nickname === next.player.nickname &&
    prev.player.photoUrl === next.player.photoUrl &&
    prev.player.jerseyNumber === next.player.jerseyNumber &&
    prev.label === next.label &&
    prev.nodeSize === next.nodeSize &&
    prev.editable === next.editable &&
    prev.containerSize.width === next.containerSize.width &&
    prev.containerSize.height === next.containerSize.height &&
    prev.initialPosition.left === next.initialPosition.left &&
    prev.initialPosition.top === next.initialPosition.top,
);

function BenchPlayerCard({
  player,
  nodeSize,
  editable,
  onPress,
}: {
  player: Player;
  nodeSize: number;
  editable: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const labelColor = pickContrastText(theme.colors.secondary);

  return (
    <Pressable
      disabled={!editable}
      onPress={onPress}
      style={[
        styles.benchCard,
        {
          width: Math.max(nodeSize + 24, 112),
          backgroundColor: theme.colors.secondary,
          borderColor: `${theme.colors.primary}99`,
          opacity: editable ? 1 : 0.88,
        },
      ]}
    >
      <View
        style={[
          styles.numberBadge,
          styles.benchBadge,
          { backgroundColor: theme.colors.primary },
        ]}
      >
        <Text style={[styles.numberText, { color: pickContrastText(theme.colors.primary) }]}>
          {player.jerseyNumber}
        </Text>
      </View>

      <Avatar
        name={player.nickname}
        photoUrl={player.photoUrl}
        size={nodeSize < 80 ? 28 : 32}
        accent={`${theme.colors.primary}22`}
      />

      <Text numberOfLines={1} style={[styles.nodeName, { color: labelColor }]}>
        {player.nickname}
      </Text>

      <Text numberOfLines={1} style={[styles.benchSub, { color: `${labelColor}CC` }]}>
        {player.fullName}
      </Text>

      {editable ? (
        <View style={styles.benchActionWrap}>
          <Text style={[styles.benchAction, { color: theme.colors.primary }]}>
            Adicionar ao campo
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function getNextStarterPosition(starters: LineupNode[]) {
  const candidates = [
    { x: 50, y: 82 },
    { x: 36, y: 76 },
    { x: 64, y: 76 },
    { x: 24, y: 64 },
    { x: 50, y: 64 },
    { x: 76, y: 64 },
    { x: 18, y: 48 },
    { x: 40, y: 46 },
    { x: 60, y: 46 },
    { x: 82, y: 48 },
    { x: 34, y: 28 },
    { x: 66, y: 28 },
    { x: 50, y: 18 },
  ];

  const freeCandidate = candidates.find(
    (candidate) =>
      !starters.some((node) => distance(node.x, node.y, candidate.x, candidate.y) < 12),
  );

  if (freeCandidate) {
    return freeCandidate;
  }

  const fallback = candidates[starters.length % candidates.length] ?? { x: 50, y: 82 };
  const offset = Math.floor(starters.length / Math.max(candidates.length, 1)) * 4;

  return {
    x: clamp(fallback.x + (starters.length % 2 === 0 ? offset : -offset), 10, 90),
    y: clamp(fallback.y - offset, 12, 88),
  };
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function toFieldPixels(
  node: LineupNode,
  fieldWidth: number,
  fieldHeight: number,
  nodeSize: number,
) {
  return {
    left: clamp((node.x / 100) * fieldWidth - nodeSize / 2, 0, fieldWidth - nodeSize),
    top: clamp((node.y / 100) * fieldHeight - nodeSize / 2, 0, fieldHeight - nodeSize),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveFieldHeight(width: number) {
  return Math.max(520, Math.min(Math.round(width * 1.75), 760));
}

function resolveNodeSize(width: number) {
  if (width <= 340) {
    return 72;
  }

  if (width <= 390) {
    return 78;
  }

  return 86;
}

function pickContrastText(color: string) {
  const normalized = color.replace('#', '');

  if (normalized.length !== 6) {
    return '#F3F7F3';
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance > 150 ? '#102118' : '#F3F7F3';
}

const styles = StyleSheet.create({
  shell: {
  borderWidth: 1,
  borderRadius: 30,
  padding: 10,
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  maxWidth: 580,
  alignSelf: 'center',
},
  field: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  logoWatermark: {
    position: 'absolute',
    top: '23%',
    left: '24%',
    width: '52%',
    height: '52%',
    opacity: 0.08,
  },
  patternWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  stripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '33%',
    opacity: 0.22,
  },
  stripeLeft: {
    left: 0,
  },
  stripeRight: {
    right: 0,
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
  },
  circle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 108,
    height: 108,
    marginLeft: -54,
    marginTop: -54,
    borderRadius: 54,
    borderWidth: 1,
  },
  boxTop: {
    position: 'absolute',
    top: 0,
    left: '22%',
    width: '56%',
    height: 88,
    borderWidth: 1,
    borderTopWidth: 0,
  },
  boxBottom: {
    position: 'absolute',
    bottom: 0,
    left: '22%',
    width: '56%',
    height: 88,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  goalTop: {
    position: 'absolute',
    top: 0,
    left: '39%',
    width: '22%',
    height: 18,
    borderWidth: 1,
    borderTopWidth: 0,
  },
  goalBottom: {
    position: 'absolute',
    bottom: 0,
    left: '39%',
    width: '22%',
    height: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  benchPanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  benchTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  benchHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  benchScrollContent: {
    gap: 10,
    paddingRight: 8,
  },
  fieldNode: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 2,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  numberBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchBadge: {
    top: 6,
    right: 6,
  },
  numberText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
  },
  nodeName: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  benchSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: 'center',
  },
  benchCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  benchActionWrap: {
    marginTop: 4,
  },
  benchAction: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBench: {
    minHeight: 70,
    justifyContent: 'center',
  },
  emptyBenchText: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
});
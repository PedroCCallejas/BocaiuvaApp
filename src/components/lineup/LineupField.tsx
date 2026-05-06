import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { LineupNode, Player } from '@/types/domain';
import { Avatar } from '@/components/ui/Avatar';

interface LineupFieldProps {
  starters: LineupNode[];
  players: Player[];
  selectedStarterId?: string | null;
  onChange: (next: LineupNode[]) => void;
  onSelectStarter?: (playerId: string) => void;
}

const NODE_SIZE = 86;

export function LineupField({
  starters,
  players,
  selectedStarterId,
  onChange,
  onSelectStarter,
}: LineupFieldProps) {
  const theme = useAppTheme();
  const [fieldSize, setFieldSize] = useState({ width: 320, height: 520 });

  function updateNode(nextNode: LineupNode) {
    onChange(
      starters.map((node) => (node.playerId === nextNode.playerId ? nextNode : node)),
    );
  }

  return (
    <View
      style={[
        styles.shell,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}>
      <LinearGradient
        colors={[theme.colors.fieldStripe, theme.colors.field]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.field}
        onLayout={(event) =>
          setFieldSize({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }>
        <View style={styles.patternWrap}>
          <View style={[styles.stripe, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
          <View style={[styles.stripe, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
          <View style={[styles.centerLine, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
          <View style={[styles.circle, { borderColor: 'rgba(255,255,255,0.18)' }]} />
          <View style={[styles.boxTop, { borderColor: 'rgba(255,255,255,0.18)' }]} />
          <View style={[styles.boxBottom, { borderColor: 'rgba(255,255,255,0.18)' }]} />
        </View>
        {starters.map((node) => {
          const player = players.find((item) => item.id === node.playerId);
          if (!player) {
            return null;
          }

          return (
            <DraggableNode
              key={node.playerId}
              node={node}
              player={player}
              fieldSize={fieldSize}
              selected={selectedStarterId === node.playerId}
              onCommit={updateNode}
              onSelect={onSelectStarter}
            />
          );
        })}
      </LinearGradient>
    </View>
  );
}

function DraggableNode({
  node,
  player,
  fieldSize,
  selected,
  onCommit,
  onSelect,
}: {
  node: LineupNode;
  player: Player;
  fieldSize: { width: number; height: number };
  selected?: boolean;
  onCommit: (next: LineupNode) => void;
  onSelect?: (playerId: string) => void;
}) {
  const theme = useAppTheme();
  const [position, setPosition] = useState(toPixels(node, fieldSize));
  const startRef = useRef(position);

  useEffect(() => {
    const next = toPixels(node, fieldSize);
    setPosition(next);
    startRef.current = next;
  }, [fieldSize.height, fieldSize.width, node.x, node.y]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = position;
      },
      onPanResponderMove: (_, gesture) => {
        setPosition({
          left: clamp(startRef.current.left + gesture.dx, 0, fieldSize.width - NODE_SIZE),
          top: clamp(startRef.current.top + gesture.dy, 0, fieldSize.height - NODE_SIZE),
        });
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5) {
          onSelect?.(node.playerId);
          return;
        }

        const left = clamp(startRef.current.left + gesture.dx, 0, fieldSize.width - NODE_SIZE);
        const top = clamp(startRef.current.top + gesture.dy, 0, fieldSize.height - NODE_SIZE);
        const x = Number((((left + NODE_SIZE / 2) / fieldSize.width) * 100).toFixed(1));
        const y = Number((((top + NODE_SIZE / 2) / fieldSize.height) * 100).toFixed(1));
        const next = { left, top };
        setPosition(next);
        startRef.current = next;
        onCommit({ ...node, x, y });
      },
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.node,
        {
          left: position.left,
          top: position.top,
          backgroundColor: selected ? theme.colors.secondarySoft : theme.colors.backgroundElevated,
          borderColor: selected ? theme.colors.secondary : theme.colors.border,
        },
      ]}>
      <View style={styles.numberBadge}>
        <Text style={[styles.numberText, { color: theme.colors.text }]}>
          {player.jerseyNumber}
        </Text>
      </View>
      <Avatar
        name={player.nickname}
        photoUrl={player.photoUrl}
        size={36}
        accent={theme.colors.primarySoft}
      />
      <Text numberOfLines={1} style={[styles.nodeName, { color: theme.colors.text }]}>
        {player.nickname}
      </Text>
    </View>
  );
}

function toPixels(node: LineupNode, fieldSize: { width: number; height: number }) {
  return {
    left: clamp((node.x / 100) * fieldSize.width - NODE_SIZE / 2, 0, fieldSize.width - NODE_SIZE),
    top: clamp((node.y / 100) * fieldSize.height - NODE_SIZE / 2, 0, fieldSize.height - NODE_SIZE),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    borderRadius: 30,
    padding: 10,
  },
  field: {
    height: 540,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  patternWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  stripe: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
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
  node: {
    position: 'absolute',
    width: NODE_SIZE,
    minHeight: NODE_SIZE,
    borderRadius: 24,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  numberBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
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
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { inferLineupZone } from '@/lib/lineup';
import type { LineupNode, Player } from '@/types/domain';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActionTarget {
  type: 'starter' | 'bench';
  playerId: string;
}

interface PickerConfig {
  title: string;
  hint?: string;
  candidateIds: string[];
  onSelect: (candidateId: string) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  const [positioningMode, setPositioningMode] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [pickerConfig, setPickerConfig] = useState<PickerConfig | null>(null);

  const nodeSize = resolveNodeSize(fieldWidth);
  const fieldHeight = resolveFieldHeight(fieldWidth);

  const startersRef = useRef(starters);
  const benchRef = useRef(benchPlayerIds);
  useEffect(() => { startersRef.current = starters; }, [starters]);
  useEffect(() => { benchRef.current = benchPlayerIds; }, [benchPlayerIds]);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  // ---------------------------------------------------------------------------
  // Core mutations
  // ---------------------------------------------------------------------------

  const commit = useCallback(
    (nextStarters: LineupNode[], nextBench: string[]) => {
      onChange({ starters: nextStarters, benchPlayerIds: nextBench });
    },
    [onChange],
  );

  const removeStarterToBench = useCallback(
    (playerId: string) => {
      const curr = startersRef.current;
      const bench = benchRef.current;
      if (bench.includes(playerId)) return;
      if (__DEV__) console.log('[lineup-ui] move applied', { from: 'field', to: 'bench', playerId });
      commit(
        curr.filter((n) => n.playerId !== playerId),
        [...bench, playerId],
      );
    },
    [commit],
  );

  const addBenchToField = useCallback(
    (playerId: string) => {
      const curr = startersRef.current;
      const bench = benchRef.current;
      if (curr.some((n) => n.playerId === playerId)) return;
      const pos = getNextStarterPosition(curr);
      if (__DEV__) console.log('[lineup-ui] move applied', { from: 'bench', to: 'field', playerId });
      commit(
        [
          ...curr,
          { playerId, x: pos.x, y: pos.y, zone: inferLineupZone(pos.y), label: null },
        ],
        bench.filter((id) => id !== playerId),
      );
    },
    [commit],
  );

  const swapFieldBench = useCallback(
    (fieldPlayerId: string, benchPlayerId: string) => {
      const curr = startersRef.current;
      const bench = benchRef.current;
      if (__DEV__) console.log('[lineup-ui] swap applied', { type: 'field-bench', fieldPlayerId, benchPlayerId });
      commit(
        curr.map((n) => (n.playerId === fieldPlayerId ? { ...n, playerId: benchPlayerId } : n)),
        bench.map((id) => (id === benchPlayerId ? fieldPlayerId : id)),
      );
    },
    [commit],
  );

  const swapFieldField = useCallback(
    (playerIdA: string, playerIdB: string) => {
      const curr = startersRef.current;
      const nodeA = curr.find((n) => n.playerId === playerIdA);
      const nodeB = curr.find((n) => n.playerId === playerIdB);
      if (!nodeA || !nodeB) return;
      if (__DEV__) console.log('[lineup-ui] swap applied', { type: 'field-field', playerIdA, playerIdB });
      commit(
        curr.map((n) => {
          if (n.playerId === playerIdA) return { ...n, x: nodeB.x, y: nodeB.y, zone: nodeB.zone };
          if (n.playerId === playerIdB) return { ...n, x: nodeA.x, y: nodeA.y, zone: nodeA.zone };
          return n;
        }),
        benchRef.current,
      );
    },
    [commit],
  );

  // Atualiza posição do titular após drag (converte pixels → porcentagem)
  const updateStarterPosition = useCallback(
    (playerId: string, center: { x: number; y: number }) => {
      const x = Number(((center.x / fieldWidth) * 100).toFixed(1));
      const y = Number(((center.y / fieldHeight) * 100).toFixed(1));
      if (__DEV__) console.log('[lineup-drag] position updated', { playerId, x, y });
      commit(
        startersRef.current.map((node) =>
          node.playerId === playerId
            ? { ...node, x, y, zone: inferLineupZone(y) }
            : node,
        ),
        benchRef.current,
      );
    },
    [commit, fieldWidth, fieldHeight],
  );

  // ---------------------------------------------------------------------------
  // Positioning mode
  // ---------------------------------------------------------------------------

  const togglePositioningMode = useCallback(() => {
    setPositioningMode((prev) => {
      const next = !prev;
      if (__DEV__) console.log('[lineup-drag] positioning mode', next ? 'on' : 'off');
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Tap handlers — abrem ActionModal (só no modo ação)
  // ---------------------------------------------------------------------------

  const handleStarterPress = useCallback(
    (playerId: string) => {
      if (!editable) return;
      if (__DEV__) console.log('[lineup-ui] starter pressed', { playerId });
      if (__DEV__) console.log('[lineup-ui] action panel opened', { type: 'starter', playerId });
      setActionTarget({ type: 'starter', playerId });
    },
    [editable],
  );

  const handleBenchPress = useCallback(
    (playerId: string) => {
      if (!editable) return;
      if (__DEV__) console.log('[lineup-ui] bench player pressed', { playerId });
      if (__DEV__) console.log('[lineup-ui] action panel opened', { type: 'bench', playerId });
      setActionTarget({ type: 'bench', playerId });
    },
    [editable],
  );

  const handleAddSlotPress = useCallback(() => {
    if (!editable || benchPlayerIds.length === 0) return;
    if (__DEV__) console.log('[lineup-ui] empty slot pressed');
    if (__DEV__) console.log('[lineup-ui] action panel opened', { type: 'add-slot' });
    setPickerConfig({
      title: 'Adicionar ao campo',
      hint: 'Escolha um reserva para entrar como titular',
      candidateIds: benchPlayerIds,
      onSelect: (id) => {
        if (__DEV__) console.log('[lineup-ui] player picked', { id, action: 'add-to-field' });
        addBenchToField(id);
      },
    });
  }, [editable, benchPlayerIds, addBenchToField]);

  // ---------------------------------------------------------------------------
  // ActionModal handlers
  // ---------------------------------------------------------------------------

  const closeAction = useCallback(() => setActionTarget(null), []);
  const closePicker = useCallback(() => setPickerConfig(null), []);

  const handleMoveToBench = useCallback(() => {
    if (actionTarget?.type !== 'starter') return;
    removeStarterToBench(actionTarget.playerId);
    closeAction();
  }, [actionTarget, removeStarterToBench, closeAction]);

  const handleStarterTrocar = useCallback(() => {
    if (actionTarget?.type !== 'starter') return;
    const fromId = actionTarget.playerId;
    const candidateIds = [
      ...starters.filter((n) => n.playerId !== fromId).map((n) => n.playerId),
      ...benchPlayerIds,
    ];
    if (candidateIds.length === 0) { closeAction(); return; }
    if (__DEV__) console.log('[lineup-ui] action panel opened', { type: 'picker-swap-from-starter', fromId });
    setActionTarget(null);
    setPickerConfig({
      title: 'Trocar com quem?',
      hint: 'Escolha um reserva ou outro titular',
      candidateIds,
      onSelect: (targetId) => {
        if (__DEV__) console.log('[lineup-ui] player picked', { targetId });
        const isField = startersRef.current.some((n) => n.playerId === targetId);
        if (isField) swapFieldField(fromId, targetId);
        else swapFieldBench(fromId, targetId);
      },
    });
  }, [actionTarget, starters, benchPlayerIds, closeAction, swapFieldField, swapFieldBench]);

  const handleBenchAddToField = useCallback(() => {
    if (actionTarget?.type !== 'bench') return;
    const benchPlayerId = actionTarget.playerId;
    if (starters.length < starterLimit) {
      addBenchToField(benchPlayerId);
      closeAction();
    } else {
      if (__DEV__) console.log('[lineup-ui] action panel opened', { type: 'picker-field-full', benchPlayerId });
      setActionTarget(null);
      setPickerConfig({
        title: 'Campo cheio. Trocar com qual titular?',
        hint: 'O titular escolhido vai para o banco',
        candidateIds: starters.map((n) => n.playerId),
        onSelect: (starterId) => {
          if (__DEV__) console.log('[lineup-ui] player picked', { starterId, action: 'swap-field-full' });
          swapFieldBench(starterId, benchPlayerId);
        },
      });
    }
  }, [actionTarget, starters, starterLimit, addBenchToField, closeAction, swapFieldBench]);

  const handleBenchTrocar = useCallback(() => {
    if (actionTarget?.type !== 'bench') return;
    const benchPlayerId = actionTarget.playerId;
    if (starters.length === 0) { closeAction(); return; }
    if (__DEV__) console.log('[lineup-ui] action panel opened', { type: 'picker-swap-from-bench', benchPlayerId });
    setActionTarget(null);
    setPickerConfig({
      title: 'Trocar com qual titular?',
      hint: 'O titular vai para o banco e o reserva entra no campo',
      candidateIds: starters.map((n) => n.playerId),
      onSelect: (starterId) => {
        if (__DEV__) console.log('[lineup-ui] player picked', { starterId, action: 'swap-bench-starter' });
        swapFieldBench(starterId, benchPlayerId);
      },
    });
  }, [actionTarget, starters, closeAction, swapFieldBench]);

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  const handleLayout = useCallback((width: number) => {
    const next = Math.min(Math.max(width - 20, 280), 560);
    setFieldWidth((curr) => (Math.abs(curr - next) > 1 ? next : curr));
  }, []);

  const canAdd = starters.length < starterLimit && benchPlayerIds.length > 0;
  const actionPlayer = actionTarget ? playerById.get(actionTarget.playerId) : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View
      style={[
        styles.shell,
        { borderColor: `${theme.colors.accent}44`, backgroundColor: theme.colors.surface },
      ]}
      onLayout={(e) => handleLayout(e.nativeEvent.layout.width)}
    >
      {/* ── Botão modo posicionar ── */}
      {editable ? (
        <Pressable
          style={[
            styles.posModeBtn,
            {
              backgroundColor: positioningMode
                ? `${theme.colors.warning ?? '#F5A623'}22`
                : theme.colors.primarySoft,
              borderColor: positioningMode
                ? (theme.colors.warning ?? '#F5A623')
                : `${theme.colors.accent}44`,
            },
          ]}
          onPress={togglePositioningMode}
        >
          <Text style={[styles.posModeBtnText, {
            color: positioningMode
              ? (theme.colors.warning ?? '#F5A623')
              : theme.colors.text,
          }]}>
            {positioningMode ? '✓  Concluir posicionamento' : '↕  Mover jogadores'}
          </Text>
        </Pressable>
      ) : null}

      {/* ── Banner modo posicionar ── */}
      {positioningMode ? (
        <View style={[
          styles.posBanner,
          {
            backgroundColor: `${theme.colors.warning ?? '#F5A623'}18`,
            borderColor: `${theme.colors.warning ?? '#F5A623'}55`,
          },
        ]}>
          <Text style={[styles.posBannerText, { color: theme.colors.text }]}>
            Arraste os jogadores no campo para reposicioná-los
          </Text>
        </View>
      ) : null}

      {/* ── Campo ── */}
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

        {/* Decorações estáticas do campo */}
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <View style={[styles.stripe, styles.stripeLeft, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
          <View style={[styles.stripe, styles.stripeRight, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
          <View style={[styles.centerLine, { backgroundColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.circle, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.boxTop, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.boxBottom, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.goalTop, { borderColor: `${theme.colors.secondary}55` }]} />
          <View style={[styles.goalBottom, { borderColor: `${theme.colors.secondary}55` }]} />
        </View>

        {/* Tokens dos titulares:
            - modo ação: Pressable direto → abre modal
            - modo posicionar: PanResponder com threshold → arrasta */}
        {starters.map((node) => {
          const player = playerById.get(node.playerId);
          if (!player) return null;
          const pos = toFieldPixels(node, fieldWidth, fieldHeight, nodeSize);
          return positioningMode ? (
            <DraggableToken
              key={`drag-${node.playerId}`}
              player={player}
              label={node.label}
              left={pos.left}
              top={pos.top}
              nodeSize={nodeSize}
              fieldWidth={fieldWidth}
              fieldHeight={fieldHeight}
              onMove={updateStarterPosition}
              onDragStateChange={onDragStateChange}
            />
          ) : (
            <FieldToken
              key={`field-${node.playerId}`}
              player={player}
              label={node.label}
              left={pos.left}
              top={pos.top}
              nodeSize={nodeSize}
              editable={editable}
              onPress={handleStarterPress}
            />
          );
        })}

        {/* Botão "Adicionar" — só no modo ação */}
        {!positioningMode && editable && canAdd ? (
          <Pressable
            style={[
              styles.addSlotBtn,
              { backgroundColor: `${theme.colors.primary}DD`, borderColor: theme.colors.accent },
            ]}
            onPress={handleAddSlotPress}
          >
            <Text style={[styles.addSlotText, { color: theme.colors.accent }]}>
              + Adicionar jogador
            </Text>
          </Pressable>
        ) : null}
      </LinearGradient>

      {/* ── Banco de reservas ── */}
      <View
        style={[
          styles.bench,
          { backgroundColor: theme.colors.backgroundElevated, borderColor: `${theme.colors.primary}33` },
        ]}
      >
        <Text style={[styles.benchTitle, { color: theme.colors.text }]}>
          Banco de {teamName}
        </Text>
        <Text style={[styles.benchHint, { color: theme.colors.textMuted }]}>
          {editable
            ? 'Toque num reserva para colocá-lo no campo ou trocar.'
            : 'Escalação em modo visualização.'}
        </Text>

        <View style={styles.benchGrid}>
          {benchPlayerIds.length === 0 ? (
            <Text style={[styles.emptyBenchText, { color: theme.colors.textMuted }]}>
              Sem reservas nesta escalação.
            </Text>
          ) : (
            benchPlayerIds.map((playerId) => {
              const player = playerById.get(playerId);
              if (!player) return null;
              return (
                <BenchCard
                  key={`bench-${playerId}`}
                  player={player}
                  editable={editable}
                  onPress={handleBenchPress}
                />
              );
            })
          )}
        </View>
      </View>

      {/* ── Modal de ações ── */}
      <Modal
        visible={actionTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeAction}
      >
        <Pressable style={styles.backdrop} onPress={closeAction}>
          <Pressable
            style={[
              styles.actionCard,
              { backgroundColor: theme.colors.surface, borderColor: `${theme.colors.accent}44` },
            ]}
          >
            {actionPlayer ? (
              <>
                <Text style={[styles.actionTitle, { color: theme.colors.text }]}>
                  {actionPlayer.nickname} #{actionPlayer.jerseyNumber}
                </Text>
                <Text style={[styles.actionSub, { color: theme.colors.textMuted }]}>
                  {actionPlayer.fullName}
                </Text>
              </>
            ) : null}

            {actionTarget?.type === 'starter' ? (
              <>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: theme.colors.primarySoft }]}
                  onPress={handleStarterTrocar}
                >
                  <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>
                    Trocar com jogador
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtnOutline, { borderColor: `${theme.colors.danger}55` }]}
                  onPress={handleMoveToBench}
                >
                  <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>
                    Mover para banco
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: theme.colors.primarySoft }]}
                  onPress={handleBenchAddToField}
                >
                  <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>
                    Colocar como titular
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: theme.colors.primarySoft }]}
                  onPress={handleBenchTrocar}
                >
                  <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>
                    Trocar com titular
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable style={styles.actionCancelBtn} onPress={closeAction}>
              <Text style={[styles.actionCancelText, { color: theme.colors.textMuted }]}>
                Fechar
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal picker de jogadores ── */}
      <Modal
        visible={pickerConfig !== null}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <View style={styles.pickerBackdrop}>
          <View
            style={[
              styles.pickerCard,
              { backgroundColor: theme.colors.surface, borderColor: `${theme.colors.accent}44` },
            ]}
          >
            <Text style={[styles.pickerTitle, { color: theme.colors.text }]}>
              {pickerConfig?.title}
            </Text>
            {pickerConfig?.hint ? (
              <Text style={[styles.pickerHint, { color: theme.colors.textMuted }]}>
                {pickerConfig.hint}
              </Text>
            ) : null}

            <ScrollView
              style={styles.pickerScroll}
              contentContainerStyle={styles.pickerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {pickerConfig?.candidateIds.map((id) => {
                const player = playerById.get(id);
                if (!player) return null;
                const isField = starters.some((n) => n.playerId === id);
                return (
                  <Pressable
                    key={id}
                    style={[
                      styles.pickerRow,
                      { borderBottomColor: `${theme.colors.border ?? theme.colors.accent}33` },
                    ]}
                    onPress={() => {
                      pickerConfig.onSelect(id);
                      closePicker();
                    }}
                  >
                    <Avatar
                      name={player.nickname}
                      photoUrl={player.photoUrl}
                      size={40}
                      accent={`${theme.colors.primary}22`}
                    />
                    <View style={styles.pickerRowText}>
                      <Text style={[styles.pickerRowName, { color: theme.colors.text }]}>
                        {player.nickname}
                        {' '}
                        <Text style={[styles.pickerRowNumber, { color: theme.colors.textMuted }]}>
                          #{player.jerseyNumber}
                        </Text>
                      </Text>
                      <Text style={[styles.pickerRowSub, { color: theme.colors.textMuted }]}>
                        {player.fullName} · {isField ? 'titular' : 'reserva'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={[styles.pickerCancelBtn, { borderColor: `${theme.colors.accent}33` }]}
              onPress={closePicker}
            >
              <Text style={[styles.pickerCancelText, { color: theme.colors.textMuted }]}>
                Cancelar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// FieldToken — Pressable puro (modo ação)
// ---------------------------------------------------------------------------

function FieldToken({
  player,
  label,
  left,
  top,
  nodeSize,
  editable,
  onPress,
}: {
  player: Player;
  label?: string | null;
  left: number;
  top: number;
  nodeSize: number;
  editable: boolean;
  onPress: (playerId: string) => void;
}) {
  const theme = useAppTheme();
  const hasPhoto = Boolean(player.photoUrl);
  const accentColor = pickContrastText(theme.colors.accent);

  return (
    <Pressable
      style={[
        styles.fieldToken,
        {
          left,
          top,
          width: nodeSize,
          minHeight: nodeSize,
          backgroundColor: theme.colors.primary,
          borderColor: `${theme.colors.secondary}AA`,
          shadowColor: theme.colors.accent,
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
      ]}
      onPress={() => {
        if (__DEV__) console.log('[lineup-ui] starter pressed', { playerId: player.id });
        if (editable) onPress(player.id);
      }}
    >
      {hasPhoto ? (
        <Image source={{ uri: player.photoUrl ?? undefined }} style={styles.tokenPhoto} />
      ) : (
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.secondary]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <LinearGradient
        colors={
          hasPhoto
            ? ['rgba(6,10,8,0.02)', 'rgba(6,10,8,0.18)', 'rgba(6,10,8,0.9)']
            : [`${theme.colors.primary}00`, `${theme.colors.primary}CC`, `${theme.colors.primary}F2`]
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {!hasPhoto ? (
        <View style={styles.tokenFallback}>
          <Avatar
            name={player.nickname}
            photoUrl={player.photoUrl}
            size={nodeSize < 88 ? 40 : 46}
            accent="rgba(255,255,255,0.16)"
          />
        </View>
      ) : null}

      <View
        style={[
          styles.tokenBadge,
          { backgroundColor: theme.colors.accent, borderColor: 'rgba(255,255,255,0.2)' },
        ]}
      >
        <Text style={[styles.tokenBadgeText, { color: accentColor }]}>
          {player.jerseyNumber}
        </Text>
      </View>

      <View style={styles.tokenNameWrap}>
        <Text numberOfLines={1} style={styles.tokenName}>
          {label?.trim() || player.nickname}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// DraggableToken — PanResponder com threshold (modo posicionar)
// Nunca usa onStartShouldSetPanResponder: () => true
// Só captura o gesto após 8px de movimento (onMoveShouldSetPanResponder)
// ---------------------------------------------------------------------------

function DraggableToken({
  player,
  label,
  left: initialLeft,
  top: initialTop,
  nodeSize,
  fieldWidth,
  fieldHeight,
  onMove,
  onDragStateChange,
}: {
  player: Player;
  label?: string | null;
  left: number;
  top: number;
  nodeSize: number;
  fieldWidth: number;
  fieldHeight: number;
  onMove: (playerId: string, center: { x: number; y: number }) => void;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const theme = useAppTheme();
  const hasPhoto = Boolean(player.photoUrl);
  const accentColor = pickContrastText(theme.colors.accent);

  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ left: initialLeft, top: initialTop });

  const startRef = useRef({ left: initialLeft, top: initialTop });
  const latestRef = useRef({ left: initialLeft, top: initialTop });
  const draggingRef = useRef(false);

  // Refs para valores dinâmicos acessados dentro do PanResponder (criado uma vez)
  const fieldWidthRef = useRef(fieldWidth);
  const fieldHeightRef = useRef(fieldHeight);
  const nodeSizeRef = useRef(nodeSize);
  const onMoveRef = useRef(onMove);
  const onDragStateRef = useRef(onDragStateChange);
  const playerIdRef = useRef(player.id);

  useEffect(() => { fieldWidthRef.current = fieldWidth; }, [fieldWidth]);
  useEffect(() => { fieldHeightRef.current = fieldHeight; }, [fieldHeight]);
  useEffect(() => { nodeSizeRef.current = nodeSize; }, [nodeSize]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onDragStateRef.current = onDragStateChange; }, [onDragStateChange]);
  useEffect(() => { playerIdRef.current = player.id; }, [player.id]);

  // Sincroniza posição visual quando as props mudam (ex: organizar automaticamente)
  useEffect(() => {
    if (!draggingRef.current) {
      const newPos = { left: initialLeft, top: initialTop };
      setPosition((curr) => {
        if (Math.abs(curr.left - newPos.left) < 1 && Math.abs(curr.top - newPos.top) < 1) {
          return curr;
        }
        return newPos;
      });
      startRef.current = newPos;
      latestRef.current = newPos;
    }
  }, [initialLeft, initialTop]);

  // PanResponder criado uma vez — todos os valores dinâmicos via refs
  const responder = useMemo(
    () =>
      PanResponder.create({
        // NÃO captura no início do toque (esse era o bug original)
        onStartShouldSetPanResponder: () => false,
        // Captura apenas após 8px de movimento
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
        // Não cede o responder a outro elemento durante o drag
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: () => {
          draggingRef.current = true;
          startRef.current = latestRef.current;
          setDragging(true);
          onDragStateRef.current?.(true);
          if (__DEV__) console.log('[lineup-drag] drag start', { playerId: playerIdRef.current });
        },

        onPanResponderMove: (_, gesture) => {
          const fw = fieldWidthRef.current;
          const fh = fieldHeightRef.current;
          const ns = nodeSizeRef.current;
          const nextLeft = clamp(startRef.current.left + gesture.dx, 0, fw - ns);
          const nextTop = clamp(startRef.current.top + gesture.dy, 0, fh - ns);
          setPosition({ left: nextLeft, top: nextTop });
          latestRef.current = { left: nextLeft, top: nextTop };
          if (__DEV__) console.log('[lineup-drag] drag move', { left: nextLeft, top: nextTop });
        },

        onPanResponderRelease: (_, gesture) => {
          const fw = fieldWidthRef.current;
          const fh = fieldHeightRef.current;
          const ns = nodeSizeRef.current;
          const finalLeft = clamp(startRef.current.left + gesture.dx, 0, fw - ns);
          const finalTop = clamp(startRef.current.top + gesture.dy, 0, fh - ns);

          draggingRef.current = false;
          setDragging(false);
          onDragStateRef.current?.(false);

          const finalPos = { left: finalLeft, top: finalTop };
          setPosition(finalPos);
          startRef.current = finalPos;
          latestRef.current = finalPos;

          if (__DEV__) console.log('[lineup-drag] drag end', { finalLeft, finalTop });
          if (__DEV__) {
            const fw2 = fieldWidthRef.current;
            const fh2 = fieldHeightRef.current;
            const ns2 = nodeSizeRef.current;
            const x = Number((((finalLeft + ns2 / 2) / fw2) * 100).toFixed(1));
            const y = Number((((finalTop + ns2 / 2) / fh2) * 100).toFixed(1));
            console.log('[lineup-drag] position updated', { playerId: playerIdRef.current, x, y });
          }

          onMoveRef.current(playerIdRef.current, {
            x: finalLeft + ns / 2,
            y: finalTop + ns / 2,
          });
        },

        onPanResponderTerminate: () => {
          draggingRef.current = false;
          setDragging(false);
          onDragStateRef.current?.(false);
          setPosition(startRef.current);
          latestRef.current = startRef.current;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.fieldToken,
        {
          left: position.left,
          top: position.top,
          width: nodeSize,
          minHeight: nodeSize,
          backgroundColor: theme.colors.primary,
          borderColor: dragging ? theme.colors.accent : `${theme.colors.secondary}AA`,
          borderWidth: dragging ? 3 : 2,
          shadowColor: theme.colors.accent,
          shadowOpacity: dragging ? 0.45 : 0.2,
          shadowRadius: dragging ? 18 : 8,
          shadowOffset: { width: 0, height: dragging ? 10 : 4 },
          elevation: dragging ? 12 : 4,
          transform: [{ scale: dragging ? 1.06 : 1 }],
          zIndex: dragging ? 30 : 10,
        },
      ]}
    >
      {hasPhoto ? (
        <Image source={{ uri: player.photoUrl ?? undefined }} style={styles.tokenPhoto} />
      ) : (
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.secondary]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <LinearGradient
        colors={
          hasPhoto
            ? ['rgba(6,10,8,0.02)', 'rgba(6,10,8,0.18)', 'rgba(6,10,8,0.9)']
            : [`${theme.colors.primary}00`, `${theme.colors.primary}CC`, `${theme.colors.primary}F2`]
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {!hasPhoto ? (
        <View style={styles.tokenFallback}>
          <Avatar
            name={player.nickname}
            photoUrl={player.photoUrl}
            size={nodeSize < 88 ? 40 : 46}
            accent="rgba(255,255,255,0.16)"
          />
        </View>
      ) : null}

      <View
        style={[
          styles.tokenBadge,
          {
            backgroundColor: dragging ? theme.colors.accent : theme.colors.accent,
            borderColor: 'rgba(255,255,255,0.2)',
          },
        ]}
      >
        <Text style={[styles.tokenBadgeText, { color: accentColor }]}>
          {player.jerseyNumber}
        </Text>
      </View>

      <View style={styles.tokenNameWrap}>
        <Text numberOfLines={1} style={styles.tokenName}>
          {label?.trim() || player.nickname}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// BenchCard — sem ScrollView wrapper próprio, usa grid direto
// ---------------------------------------------------------------------------

function BenchCard({
  player,
  editable,
  onPress,
}: {
  player: Player;
  editable: boolean;
  onPress: (playerId: string) => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      style={[
        styles.benchCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: `${theme.colors.secondary}44`,
        },
      ]}
      onPress={() => {
        if (__DEV__) console.log('[lineup-ui] bench player pressed', { playerId: player.id });
        if (editable) onPress(player.id);
      }}
    >
      <LinearGradient
        colors={[`${theme.colors.primary}1F`, `${theme.colors.secondary}12`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View
        style={[
          styles.benchCardBadge,
          { backgroundColor: theme.colors.primary, borderColor: `${theme.colors.primary}66` },
        ]}
      >
        <Text style={[styles.tokenBadgeText, { color: pickContrastText(theme.colors.primary) }]}>
          {player.jerseyNumber}
        </Text>
      </View>

      <Avatar
        name={player.nickname}
        photoUrl={player.photoUrl}
        size={40}
        accent={`${theme.colors.primary}22`}
      />

      <Text numberOfLines={1} style={[styles.benchCardName, { color: theme.colors.text }]}>
        {player.nickname}
      </Text>

      {editable ? (
        <View
          style={[
            styles.benchCardAction,
            { backgroundColor: theme.colors.primarySoft, borderColor: `${theme.colors.primary}22` },
          ]}
        >
          <Text style={[styles.benchCardActionText, { color: theme.colors.text }]}>
            Titular
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNextStarterPosition(starters: LineupNode[]) {
  const candidates = [
    { x: 50, y: 82 }, { x: 36, y: 76 }, { x: 64, y: 76 },
    { x: 24, y: 64 }, { x: 50, y: 64 }, { x: 76, y: 64 },
    { x: 18, y: 48 }, { x: 40, y: 46 }, { x: 60, y: 46 }, { x: 82, y: 48 },
    { x: 34, y: 28 }, { x: 66, y: 28 }, { x: 50, y: 18 },
  ];

  const free = candidates.find(
    (c) => !starters.some((n) => dist(n.x, n.y, c.x, c.y) < 12),
  );
  if (free) return free;

  const fb = candidates[starters.length % candidates.length] ?? { x: 50, y: 82 };
  const off = Math.floor(starters.length / Math.max(candidates.length, 1)) * 4;
  return {
    x: clamp(fb.x + (starters.length % 2 === 0 ? off : -off), 10, 90),
    y: clamp(fb.y - off, 12, 88),
  };
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function toFieldPixels(node: LineupNode, fw: number, fh: number, ns: number) {
  return {
    left: clamp((node.x / 100) * fw - ns / 2, 0, fw - ns),
    top: clamp((node.y / 100) * fh - ns / 2, 0, fh - ns),
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function resolveFieldHeight(w: number) {
  return Math.max(520, Math.min(Math.round(w * 1.75), 760));
}

function resolveNodeSize(w: number) {
  if (w <= 340) return 80;
  if (w <= 390) return 88;
  return 96;
}

function pickContrastText(color: string) {
  const n = color.replace('#', '');
  if (n.length !== 6) return '#F3F7F3';
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#102118' : '#F3F7F3';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Shell
  shell: {
    borderWidth: 1,
    borderRadius: 30,
    padding: 10,
    width: '100%',
    maxWidth: 580,
    alignSelf: 'center',
    overflow: 'hidden',
  },

  // Positioning mode toggle button
  posModeBtn: {
    alignSelf: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  posModeBtnText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
  },

  // Positioning mode banner
  posBanner: {
    marginBottom: 8,
    marginHorizontal: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  posBannerText: {
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Field
  field: {
    borderRadius: 22,
    overflow: 'hidden',
    width: '100%',
  },
  logoWatermark: {
    position: 'absolute',
    top: '23%',
    left: '24%',
    width: '52%',
    height: '52%',
    opacity: 0.08,
  },
  stripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '33%',
    opacity: 0.22,
  },
  stripeLeft: { left: 0 },
  stripeRight: { right: 0 },
  centerLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1 },
  circle: {
    position: 'absolute', top: '50%', left: '50%',
    width: 108, height: 108, marginLeft: -54, marginTop: -54,
    borderRadius: 54, borderWidth: 1,
  },
  boxTop: {
    position: 'absolute', top: 0, left: '22%',
    width: '56%', height: 88, borderWidth: 1, borderTopWidth: 0,
  },
  boxBottom: {
    position: 'absolute', bottom: 0, left: '22%',
    width: '56%', height: 88, borderWidth: 1, borderBottomWidth: 0,
  },
  goalTop: {
    position: 'absolute', top: 0, left: '39%',
    width: '22%', height: 18, borderWidth: 1, borderTopWidth: 0,
  },
  goalBottom: {
    position: 'absolute', bottom: 0, left: '39%',
    width: '22%', height: 18, borderWidth: 1, borderBottomWidth: 0,
  },

  // Field token (shared between FieldToken e DraggableToken)
  fieldToken: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tokenPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  tokenFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 18,
  },
  tokenBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  tokenBadgeText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
  },
  tokenNameWrap: {
    paddingHorizontal: 8,
    paddingTop: 28,
    paddingBottom: 8,
  },
  tokenName: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    color: '#F7FBF8',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Add slot button
  addSlotBtn: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  addSlotText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
  },

  // Bench
  bench: {
    marginTop: 18,
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
  benchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  emptyBenchText: {
    fontFamily: fonts.body,
    fontSize: 13,
    paddingVertical: 16,
  },

  // Bench card
  benchCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    minWidth: 100,
  },
  benchCardBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchCardName: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  benchCardAction: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  benchCardActionText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
  },

  // Action modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  actionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  actionSub: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  actionBtn: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnOutline: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  actionCancelBtn: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionCancelText: {
    fontFamily: fonts.body,
    fontSize: 14,
  },

  // Picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    paddingBottom: 0,
    maxHeight: '80%',
  },
  pickerTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  pickerHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  pickerScroll: {
    maxHeight: 380,
  },
  pickerScrollContent: {
    gap: 2,
    paddingBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerRowText: {
    flex: 1,
    gap: 2,
  },
  pickerRowName: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  pickerRowNumber: {
    fontWeight: '400',
  },
  pickerRowSub: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  pickerCancelBtn: {
    marginTop: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerCancelText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { MetricCard } from '@/components/cards/MetricCard';
import { LineupField } from '@/components/lineup/LineupField';
import { LineupShareCard } from '@/components/lineup/LineupShareCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMatchDateTime } from '@/lib/date';
import {
  areLineupStatesEqual,
  buildLineupFromPreset,
  buildLineupStateFromSource,
  getFormationPresetByKey,
  getFormationPresets,
  sanitizeLineupLayoutState,
} from '@/lib/lineup';
import { useAppStore } from '@/store/app-store';
import {
  findLineupByMatchId,
  findMatchById,
  selectCanManageTeam,
  selectCurrentTeam,
  selectTeamPlayers,
} from '@/store/selectors';
import type { LineupNode } from '@/types/domain';

interface LocalLineupState {
  formationKey: string;
  starters: LineupNode[];
  benchPlayerIds: string[];
}

type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved';
type ShareAvailability = 'unknown' | 'available' | 'unavailable';
type ShareAction = 'idle' | 'sharing' | 'downloading';

const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1350;

export default function LineupScreen() {
  const params = useLocalSearchParams<{ matchId?: string | string[] }>();
  const navigation = useNavigation();
  const theme = useAppTheme();

  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const players = useAppStore(selectTeamPlayers);
  const canManage = useAppStore(selectCanManageTeam);
  const saveLineup = useAppStore((state) => state.saveLineup);

  const rawMatchId = params.matchId;
  const resolvedMatchId =
    typeof rawMatchId === 'string' ? rawMatchId : (rawMatchId?.[0] ?? '');

  const currentMatch =
    useAppStore((state) => findMatchById(state, resolvedMatchId)) ?? null;
  const existingLineup = useAppStore((state) =>
    findLineupByMatchId(state, resolvedMatchId),
  );

  const isReadOnly = !canManage;
  const starterLimit = currentMatch ? currentMatch.linePlayersCount + 1 : 0;

  const presets = useMemo(
    () =>
      currentMatch
        ? getFormationPresets(
            currentMatch.matchType,
            currentMatch.linePlayersCount,
          )
        : [],
    [currentMatch?.linePlayersCount, currentMatch?.matchType],
  );
  const fallbackPreset = presets[0] ?? null;

  const attendanceByPlayerId = useMemo(
    () =>
      new Map(
        snapshot.attendance
          .filter((item) => item.matchId === currentMatch?.id)
          .map((item) => [item.playerId, item.status] as const),
      ),
    [currentMatch?.id, snapshot.attendance],
  );

  const confirmedPlayers = useMemo(
    () =>
      players.filter(
        (player) => attendanceByPlayerId.get(player.id) === 'confirmed',
      ),
    [attendanceByPlayerId, players],
  );

  const publishedPlayerIdSet = useMemo(() => {
    if (!existingLineup) {
      return new Set<string>();
    }

    return new Set([
      ...existingLineup.starters.map((node) => node.playerId),
      ...existingLineup.benchPlayerIds,
    ]);
  }, [existingLineup]);

  const publishedPlayers = useMemo(
    () =>
      players.filter((player) => publishedPlayerIdSet.has(player.id)),
    [players, publishedPlayerIdSet],
  );

  const confirmedPlayersKey = useMemo(
    () => confirmedPlayers.map((player) => player.id).join('|'),
    [confirmedPlayers],
  );
  const publishedPlayersKey = useMemo(
    () => publishedPlayers.map((player) => player.id).join('|'),
    [publishedPlayers],
  );

  const absentCount = useMemo(
    () =>
      players.filter(
        (player) => attendanceByPlayerId.get(player.id) === 'absent',
      ).length,
    [attendanceByPlayerId, players],
  );

  const pendingCount = useMemo(
    () =>
      players.filter((player) => {
        const status = attendanceByPlayerId.get(player.id);
        return status == null || status === 'pending';
      }).length,
    [attendanceByPlayerId, players],
  );

  const editablePreset = useMemo(() => {
    if (!currentMatch || !fallbackPreset) {
      return null;
    }

    return getFormationPresetByKey(
      currentMatch.matchType,
      currentMatch.linePlayersCount,
      existingLineup?.formationKey ?? fallbackPreset.key,
    );
  }, [
    currentMatch?.linePlayersCount,
    currentMatch?.matchType,
    existingLineup?.formationKey,
    fallbackPreset,
  ]);

  const editableSourceLineup = useMemo<LocalLineupState | null>(() => {
    if (!editablePreset) {
      return null;
    }

    return buildLineupStateFromSource({
      existingLineup,
      preset: editablePreset,
      players: confirmedPlayers,
    });
  }, [confirmedPlayers, editablePreset, existingLineup]);

  const readOnlyLineup = useMemo<LocalLineupState | null>(() => {
    if (!existingLineup || !currentMatch || !fallbackPreset) {
      return null;
    }

    const preset = getFormationPresetByKey(
      currentMatch.matchType,
      currentMatch.linePlayersCount,
      existingLineup.formationKey ?? fallbackPreset.key,
    );

    return buildLineupStateFromSource({
      existingLineup,
      preset,
      players: publishedPlayers,
    });
  }, [
    currentMatch?.linePlayersCount,
    currentMatch?.matchType,
    existingLineup,
    fallbackPreset,
    publishedPlayers,
  ]);

  const initialDraft = useMemo<LocalLineupState>(
    () =>
      editableSourceLineup ?? {
        formationKey: fallbackPreset?.key ?? '',
        starters: [],
        benchPlayerIds: [],
      },
    [editableSourceLineup, fallbackPreset?.key],
  );

  const [draft, setDraft] = useState<LocalLineupState>(initialDraft);
  const [isDragging, setIsDragging] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('clean');
  const [shareAvailability, setShareAvailability] = useState<ShareAvailability>(
    Platform.OS === 'web' ? 'unknown' : 'available',
  );
  const [shareAction, setShareAction] = useState<ShareAction>('idle');
  const [shareCardReady, setShareCardReady] = useState(false);

  const draftRef = useRef<LocalLineupState>(initialDraft);
  const sourceDraftRef = useRef<LocalLineupState>(initialDraft);
  const isDirtyRef = useRef(false);
  const isDraggingRef = useRef(false);
  const justSavedRef = useRef(false);
  const saveStatusRef = useRef<SaveStatus>('clean');
  const shareCardRef = useRef<View>(null);

  const setSavePhase = useCallback((next: SaveStatus) => {
    saveStatusRef.current = next;
    setSaveStatus(next);
  }, []);

  const handleDragStateChange = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
    setIsDragging(dragging);
  }, []);

  const normalizeDraft = useCallback(
    (next: LocalLineupState) => {
      if (!currentMatch || !fallbackPreset) {
        return next;
      }

      const preset = getFormationPresetByKey(
        currentMatch.matchType,
        currentMatch.linePlayersCount,
        next.formationKey || fallbackPreset.key,
      );

      return sanitizeLineupLayoutState({
        formationKey: next.formationKey || preset.key,
        starters: next.starters,
        benchPlayerIds: next.benchPlayerIds,
        players: confirmedPlayers,
        starterLimit,
        fallbackFormationKey: preset.key,
        fallbackCoordinates: preset.coordinates,
      });
    },
    [confirmedPlayers, currentMatch, fallbackPreset, starterLimit],
  );

  const applyDraft = useCallback(
    (next: LocalLineupState) => {
      const previous = draftRef.current;
      const normalized = normalizeDraft(next);
      const draftChanged = !areLineupStatesEqual(previous, normalized);
      const wasDirty = isDirtyRef.current;
      const nextDirty =
        !existingLineup ||
        !areLineupStatesEqual(normalized, sourceDraftRef.current);

      draftRef.current = normalized;
      setDraft(normalized);
      isDirtyRef.current = nextDirty;

      if (__DEV__ && draftChanged) {
        console.log('[lineup-ui] draft changed', {
          formationKey: normalized.formationKey,
          starters: normalized.starters.length,
          bench: normalized.benchPlayerIds.length,
          dirty: nextDirty,
        });
      }

      if (__DEV__ && !wasDirty && nextDirty) {
        console.log('[lineup-save] button enabled');
      }

      setSavePhase(nextDirty ? 'dirty' : 'clean');
      return normalized;
    },
    [existingLineup, normalizeDraft, setSavePhase],
  );

  useEffect(() => {
    let active = true;

    if (Platform.OS !== 'web') {
      setShareAvailability('available');
      return () => {
        active = false;
      };
    }

    void Sharing.isAvailableAsync()
      .then((available) => {
        if (active) {
          setShareAvailability(available ? 'available' : 'unavailable');
        }
      })
      .catch(() => {
        if (active) {
          setShareAvailability('unavailable');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!editableSourceLineup || !currentMatch) {
      return;
    }

    const sourceChanged = !areLineupStatesEqual(
      sourceDraftRef.current,
      editableSourceLineup,
    );

    if (__DEV__) {
      console.log('[lineup-snapshot] received', {
        changed: sourceChanged,
        isDirty: isDirtyRef.current,
        justSaved: justSavedRef.current,
      });
    }

    sourceDraftRef.current = editableSourceLineup;

    if (isDraggingRef.current || isDragging || isDirtyRef.current) {
      if (__DEV__) {
        console.log('[lineup-snapshot] ignored stale', {
          isDragging: isDraggingRef.current || isDragging,
          isDirty: isDirtyRef.current,
        });
      }
      return;
    }

    const draftChanged = !areLineupStatesEqual(draftRef.current, editableSourceLineup);
    if (draftChanged) {
      draftRef.current = editableSourceLineup;
      setDraft(editableSourceLineup);
    }

    if (__DEV__) {
      console.log('[lineup-snapshot] applied', {
        draftChanged,
        starters: editableSourceLineup.starters.length,
        bench: editableSourceLineup.benchPlayerIds.length,
        justSaved: justSavedRef.current,
      });
    }

    isDirtyRef.current = !existingLineup;
    if (!justSavedRef.current) {
      setSavePhase(existingLineup ? 'clean' : 'dirty');
    }
    justSavedRef.current = false;
  }, [
    currentMatch?.id,
    editableSourceLineup,
    existingLineup,
    isDragging,
    setSavePhase,
  ]);

  const lineupState = canManage ? draft : readOnlyLineup;
  const lineupPlayers = canManage ? confirmedPlayers : publishedPlayers;
  const hasUnsavedChanges =
    canManage && (saveStatus === 'dirty' || saveStatus === 'saving');
  const hasSavedLineup = Boolean(existingLineup) || saveStatus === 'saved';
  const canExportLineup =
    canManage &&
    hasSavedLineup &&
    !hasUnsavedChanges &&
    Boolean(lineupState?.starters.length) &&
    shareCardReady;

  usePreventRemove(hasUnsavedChanges, (event) => {
    Alert.alert(
      'Escalação não salva',
      'Você tem alterações pendentes na escalação. Deseja sair sem salvar?',
      [
        { text: 'Continuar editando', style: 'cancel' },
        {
          text: 'Sair sem salvar',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ],
    );
  });

  const handleDraftChange = useCallback(
    (next: { starters: LineupNode[]; benchPlayerIds: string[] }) => {
      if (!canManage) {
        return;
      }

      applyDraft({
        formationKey: draftRef.current.formationKey || fallbackPreset?.key || '',
        starters: next.starters,
        benchPlayerIds: next.benchPlayerIds,
      });
    },
    [applyDraft, canManage, fallbackPreset?.key],
  );

  const handleAutoArrange = useCallback(
    (nextPresetKey?: string) => {
      if (!canManage || !fallbackPreset || !currentMatch) {
        return;
      }

      const preset = getFormationPresetByKey(
        currentMatch.matchType,
        currentMatch.linePlayersCount,
        nextPresetKey ?? draftRef.current.formationKey ?? fallbackPreset.key,
      );
      const autoLineup = buildLineupFromPreset(preset, confirmedPlayers);

      applyDraft({
        formationKey: preset.key,
        starters: autoLineup.starters,
        benchPlayerIds: autoLineup.benchPlayerIds,
      });
    },
    [applyDraft, canManage, confirmedPlayers, currentMatch, fallbackPreset],
  );

  const handleClearLineup = useCallback(() => {
    if (!canManage || !fallbackPreset) {
      return;
    }

    applyDraft({
      formationKey: draftRef.current.formationKey || fallbackPreset.key,
      starters: [],
      benchPlayerIds: confirmedPlayers.map((player) => player.id),
    });
  }, [applyDraft, canManage, confirmedPlayers, fallbackPreset]);

  const handleSave = useCallback(async () => {
    if (!canManage || !currentMatch || !fallbackPreset) {
      return;
    }

    if (saveStatusRef.current !== 'dirty') {
      if (__DEV__) console.warn('[lineup-save] blocked: status is', saveStatusRef.current);
      return;
    }

    const payload = normalizeDraft({
      formationKey: draftRef.current.formationKey || fallbackPreset.key,
      starters: draftRef.current.starters,
      benchPlayerIds: draftRef.current.benchPlayerIds,
    });

    if (__DEV__) {
      console.log('[lineup-save] draft before save', {
        formationKey: payload.formationKey,
        starters: payload.starters.length,
        bench: payload.benchPlayerIds.length,
      });
      console.log('[lineup-save] starters', payload.starters.map((n) => n.playerId));
      console.log('[lineup-save] bench', payload.benchPlayerIds);
      console.log('[lineup-save] positions', payload.starters.map((n) => ({ id: n.playerId, x: n.x, y: n.y, zone: n.zone })));
      console.log('[lineup-save] payload', { matchId: currentMatch.id, formationKey: payload.formationKey, starters: payload.starters, benchPlayerIds: payload.benchPlayerIds });
    }

    try {
      setSavePhase('saving');

      if (__DEV__) console.log('[lineup-save] firebase write start', { matchId: currentMatch.id });

      await saveLineup({
        matchId: currentMatch.id,
        formationKey: payload.formationKey,
        starters: payload.starters,
        benchPlayerIds: payload.benchPlayerIds,
      });

      if (__DEV__) console.log('[lineup-save] firebase write success', { matchId: currentMatch.id });

      sourceDraftRef.current = payload;
      draftRef.current = payload;
      setDraft(payload);
      isDirtyRef.current = false;
      justSavedRef.current = true;
      setSavePhase('saved');

      if (__DEV__) {
        const storeLineups = useAppStore.getState().snapshot.lineups;
        const savedDoc = storeLineups.find((l) => l.matchId === currentMatch.id) ?? null;
        console.log('[lineup-save] saved document after write', {
          found: Boolean(savedDoc),
          formationKey: savedDoc?.formationKey,
          starters: savedDoc?.starters.length,
          bench: savedDoc?.benchPlayerIds.length,
        });
        if (savedDoc && editablePreset) {
          const savedState = buildLineupStateFromSource({
            existingLineup: savedDoc,
            preset: editablePreset,
            players: confirmedPlayers,
          });
          const isMatch = areLineupStatesEqual(payload, savedState);
          console.log('[lineup-save] compare draft vs saved', { match: isMatch });
          if (!isMatch) {
            console.warn('[lineup-save] MISMATCH', {
              payloadStarters: payload.starters.map((n) => ({ id: n.playerId, x: n.x, y: n.y })),
              savedStarters: savedState.starters.map((n) => ({ id: n.playerId, x: n.x, y: n.y })),
              payloadBench: payload.benchPlayerIds,
              savedBench: savedState.benchPlayerIds,
            });
          }
        }
      }

      Alert.alert(
        'Escalação salva',
        'A distribuição dos jogadores foi atualizada com sucesso.',
      );
    } catch (error) {
      setSavePhase('dirty');

      const errorCode = (error as { code?: string }).code ?? null;
      const errorMessage = error instanceof Error ? error.message : 'Tente novamente.';

      if (__DEV__) {
        console.log('[lineup-save] firebase write failed', {
          code: errorCode,
          message: errorMessage,
          error,
        });
      }

      Alert.alert(
        'Não foi possível salvar',
        errorCode ? `${errorMessage}\n(${errorCode})` : errorMessage,
      );
    }
  }, [canManage, confirmedPlayers, currentMatch, editablePreset, fallbackPreset, normalizeDraft, saveLineup, setSavePhase]);

  const handleShareOrDownload = useCallback(
    async (mode: 'share' | 'download') => {
      if (!currentMatch || !team || !lineupState || !shareCardRef.current) {
        return;
      }

      if (!canExportLineup) {
        if (hasUnsavedChanges) {
          Alert.alert(
            'Salve antes de compartilhar',
            'A imagem da escalação só fica disponível depois que a versão atual for salva.',
          );
        }
        return;
      }

      const action = mode === 'share' ? 'sharing' : 'downloading';

      try {
        setShareAction(action);

        if (__DEV__) {
          console.log('[lineup-share] capture start', {
            mode,
            matchId: currentMatch.id,
          });
        }

        const imageResult = await captureRef(shareCardRef.current, {
          format: 'png',
          quality: 1,
          result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
        });

        if (__DEV__) {
          console.log('[lineup-share] capture success', {
            mode,
            kind: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
          });
        }

        if (mode === 'download') {
          if (Platform.OS !== 'web') {
            throw new Error('O download direto da imagem está disponível apenas no navegador.');
          }

          downloadDataUri(
            imageResult,
            buildLineupFileName(team.name, currentMatch.opponentName, currentMatch.date),
          );

          if (__DEV__) {
            console.log('[lineup-share] download fallback');
          }

          return;
        }

        const shareAvailable = await Sharing.isAvailableAsync();

        if (Platform.OS === 'web') {
          if (shareAvailable) {
            try {
              await Sharing.shareAsync(imageResult, {
                dialogTitle: 'Compartilhar escalação',
              });
            } catch (error) {
              if (__DEV__) {
                console.log('[lineup-share] share unavailable', { error });
              }

              downloadDataUri(
                imageResult,
                buildLineupFileName(team.name, currentMatch.opponentName, currentMatch.date),
              );

              if (__DEV__) {
                console.log('[lineup-share] download fallback');
              }
            }
          } else {
            if (__DEV__) {
              console.log('[lineup-share] share unavailable');
            }

            downloadDataUri(
              imageResult,
              buildLineupFileName(team.name, currentMatch.opponentName, currentMatch.date),
            );

            if (__DEV__) {
              console.log('[lineup-share] download fallback');
            }
          }

          return;
        }

        if (!shareAvailable) {
          if (__DEV__) {
            console.log('[lineup-share] share unavailable');
          }

          throw new Error('O compartilhamento não está disponível neste dispositivo.');
        }

        await Sharing.shareAsync(
          imageResult.startsWith('file://') ? imageResult : `file://${imageResult}`,
          {
            dialogTitle: 'Compartilhar escalação',
            mimeType: 'image/png',
          },
        );
      } catch (error) {
        if (__DEV__) {
          console.log('[lineup-share] failed', {
            mode,
            error,
          });
        }

        Alert.alert(
          'Não foi possível gerar a imagem da escalação.',
          error instanceof Error ? error.message : 'Tente novamente.',
        );
      } finally {
        setShareAction('idle');
      }
    },
    [canExportLineup, currentMatch, hasUnsavedChanges, lineupState, team],
  );

  if (!currentMatch || !team) {
    return (
      <Screen>
        <EmptyState
          title="Escalação indisponível"
          description="Não foi possível encontrar esta partida ou o time ativo."
        />
      </Screen>
    );
  }

  if (!fallbackPreset) {
    return (
      <Screen>
        <EmptyState
          title="Sem formação disponível"
          description="Ainda não encontramos uma formação compatível com este tipo de partida."
        />
      </Screen>
    );
  }

  if (isReadOnly && !existingLineup) {
    return (
      <Screen>
        <EmptyState
          title="Escalação ainda não publicada"
          description="O administrador ainda não salvou a escalação desta partida."
        />
      </Screen>
    );
  }

  if (
    canManage &&
    (currentMatch.status === 'finished' || currentMatch.status === 'canceled')
  ) {
    return (
      <Screen>
        <EmptyState
          title="Escalação bloqueada"
          description="A escalação pode ser ajustada apenas antes do encerramento da partida."
        />
      </Screen>
    );
  }

  if (canManage && confirmedPlayers.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Sem jogadores confirmados"
          description="Confirme a presença do elenco antes de montar a escalação."
        />
      </Screen>
    );
  }

  if (!lineupState) {
    return (
      <Screen>
        <EmptyState
          title="Escalação indisponível"
          description="Não foi possível carregar a escalação desta partida."
        />
      </Screen>
    );
  }

  return (
    <Screen keyboardAware={false} scrollEnabled={!isDragging}>
      <SectionHeader
        title="Escalação visual"
        subtitle={`${currentMatch.opponentName} - ${starterLimit} em campo`}
      />

      <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
        {canManage
          ? 'Toque num jogador para ver opções, trocar ou mover para o banco. Arraste para reposicionar no campo.'
          : 'Somente visualização. Apenas administradores podem alterar a escalação.'}
      </Text>

      <View style={styles.metricsRow}>
        <MetricCard
          label="Em campo"
          value={String(lineupState.starters.length)}
          helper={`limite ${starterLimit}`}
        />
        <MetricCard
          label="Banco "
          value={String(lineupState.benchPlayerIds.length)}
          helper={
            canManage
              ? `${confirmedPlayers.length} confirmados`
              : `${lineupPlayers.length} na escalação`
          }
        />
        <MetricCard
          label="Ausentes"
          value={String(absentCount)}
          helper={`${pendingCount} pendentes`}
        />
      </View>

      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor:
              !canManage
                ? theme.colors.border
                : saveStatus === 'saved'
                  ? theme.colors.success
                  : saveStatus === 'dirty'
                    ? theme.colors.warning
                    : theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.statusTitle, { color: theme.colors.text }]}>
          {!canManage
            ? 'Somente visualização'
            : saveStatus === 'saving'
              ? 'Salvando...'
              : saveStatus === 'saved'
                ? 'Escalação salva'
                : saveStatus === 'dirty'
                  ? 'Escalação não salva'
                  : 'Escalação pronta'}
        </Text>

        <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>
          {!canManage
            ? 'Apenas administradores podem organizar, limpar ou salvar a escalação.'
            : saveStatus === 'saving'
              ? 'Persistindo a distribuição atual no time.'
              : saveStatus === 'saved'
                ? 'As coordenadas atuais já estão sincronizadas.'
                : saveStatus === 'dirty'
                  ? 'Você tem alterações pendentes. Só enviamos para o banco ao tocar em salvar.'
                  : 'Mova jogadores livremente e salve apenas quando terminar.'}
        </Text>
      </View>

      {canManage ? (
        <View style={styles.formationRow}>
          {presets.map((preset) => {
            const selected = draft.formationKey === preset.key;

            return (
              <Pressable
                key={preset.key}
                onPress={() => handleAutoArrange(preset.key)}
                style={[
                  styles.formationChip,
                  {
                    backgroundColor: selected
                      ? theme.colors.primarySoft
                      : theme.colors.surface,
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.formationText, { color: theme.colors.text }]}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <LineupField
        starters={lineupState.starters}
        benchPlayerIds={lineupState.benchPlayerIds}
        players={lineupPlayers}
        starterLimit={starterLimit}
        teamName={team.name}
        teamLogoUrl={team.logoUrl ?? null}
        editable={canManage}
        onDragStateChange={handleDragStateChange}
        onChange={handleDraftChange}
      />

      {canManage ? (
        <View style={styles.actionRow}>
          <AppButton
            label="Organizar automaticamente"
            variant="secondary"
            onPress={() => handleAutoArrange()}
          />
          <AppButton
            label="Limpar escalação"
            variant="ghost"
            onPress={handleClearLineup}
          />
          <AppButton
            label="Salvar escalação"
            disabled={saveStatus !== 'dirty'}
            loading={saveStatus === 'saving'}
            onPress={() => void handleSave()}
          />
        </View>
      ) : null}

      {canManage ? (
        <View style={styles.shareSection}>
          <SectionHeader
            title="Arte para compartilhar"
            subtitle={
              hasUnsavedChanges
                ? 'Salve a versão atual antes de compartilhar ou baixar a imagem.'
                : 'Arte da escalação para compartilhar — separada dos botões de edição.'
            }
          />

          <View
            ref={shareCardRef}
            collapsable={false}
            onLayout={() => setShareCardReady(true)}
            style={styles.shareCardWrap}
          >
            <LineupShareCard
              teamName={team.name}
              teamLogoUrl={team.logoUrl ?? null}
              opponentName={currentMatch.opponentName}
              matchLabel={buildMatchShareLabel(currentMatch)}
              starters={lineupState.starters}
              benchPlayerIds={lineupState.benchPlayerIds}
              players={lineupPlayers}
              colors={{
                primary: team.primaryColor,
                secondary: team.secondaryColor,
                accent: team.accentColor ?? null,
              }}
            />
          </View>

          <Text style={[styles.shareHint, { color: theme.colors.textMuted }]}>
            {Platform.OS === 'web'
              ? shareAvailability === 'available'
                ? 'No navegador compatível você pode compartilhar ou baixar a imagem PNG.'
                : 'Se o navegador não oferecer compartilhamento nativo, o fluxo cai para download do PNG.'
              : 'No celular, o botão usa o compartilhamento nativo quando disponível.'}
          </Text>

          <View style={styles.actionRow}>
            {Platform.OS === 'web' && shareAvailability === 'available' ? (
              <AppButton
                label="Compartilhar escalação"
                variant="secondary"
                disabled={!canExportLineup || shareAction !== 'idle'}
                loading={shareAction === 'sharing'}
                onPress={() => void handleShareOrDownload('share')}
              />
            ) : null}

            {Platform.OS === 'web' ? (
              <AppButton
                label="Baixar imagem PNG"
                variant={shareAvailability === 'available' ? 'ghost' : 'secondary'}
                disabled={!canExportLineup || shareAction !== 'idle'}
                loading={shareAction === 'downloading'}
                onPress={() => void handleShareOrDownload('download')}
              />
            ) : (
              <AppButton
                label="Compartilhar escalação"
                variant="secondary"
                disabled={!canExportLineup || shareAction !== 'idle'}
                loading={shareAction === 'sharing'}
                onPress={() => void handleShareOrDownload('share')}
              />
            )}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function buildMatchShareLabel(match: { date: string; time: string; venue: string }) {
  const dateTime = formatMatchDateTime(match);
  const venue = match.venue?.trim();

  if (dateTime && venue) {
    return `${dateTime} - ${venue}`;
  }

  return dateTime || venue || null;
}

function buildLineupFileName(teamName: string, opponentName: string, date: string) {
  const safeTeam = slugifyShareValue(teamName);
  const safeOpponent = slugifyShareValue(opponentName);
  const safeDate = slugifyShareValue(date);

  return `${safeTeam || 'time'}-${safeOpponent || 'partida'}-${safeDate || 'escalacao'}.png`;
}

function slugifyShareValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function downloadDataUri(dataUri: string, fileName: string) {
  if (typeof document === 'undefined') {
    throw new Error('O navegador não disponibilizou o download da imagem.');
  }

  const anchor = document.createElement('a');
  anchor.href = dataUri;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

const styles = StyleSheet.create({
  helper: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 8,
  },
  statusTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  statusText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  formationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  formationChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  formationText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  shareSection: {
    gap: 12,
  },
  shareCardWrap: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  shareHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
});

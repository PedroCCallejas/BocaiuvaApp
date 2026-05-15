import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "@react-navigation/native";

import { MetricCard } from "@/components/cards/MetricCard";
import { LineupField } from "@/components/lineup/LineupField";
import { AppButton } from "@/components/ui/AppButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { fonts } from "@/constants/theme";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  buildLineupFromPreset,
  buildLineupStateFromSource,
  getFormationPresets,
} from "@/lib/lineup";
import { useAppStore } from "@/store/app-store";
import {
  findLineupByMatchId,
  findMatchById,
  selectCanManageTeam,
  selectCurrentTeam,
  selectTeamPlayers,
} from "@/store/selectors";
import type { LineupNode } from "@/types/domain";

interface LocalLineupState {
  formationKey: string;
  starters: LineupNode[];
  benchPlayerIds: string[];
}

type SaveStatus = "clean" | "dirty" | "saving" | "saved";

function areLineupStatesEqual(left: LocalLineupState, right: LocalLineupState) {
  if (
    left.formationKey !== right.formationKey ||
    left.starters.length !== right.starters.length ||
    left.benchPlayerIds.length !== right.benchPlayerIds.length
  ) {
    return false;
  }

  for (let index = 0; index < left.starters.length; index += 1) {
    const leftNode = left.starters[index];
    const rightNode = right.starters[index];

    if (
      leftNode.playerId !== rightNode.playerId ||
      leftNode.x !== rightNode.x ||
      leftNode.y !== rightNode.y ||
      leftNode.zone !== rightNode.zone ||
      (leftNode.label ?? null) !== (rightNode.label ?? null)
    ) {
      return false;
    }
  }

  for (let index = 0; index < left.benchPlayerIds.length; index += 1) {
    if (left.benchPlayerIds[index] !== right.benchPlayerIds[index]) {
      return false;
    }
  }

  return true;
}

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
    typeof rawMatchId === "string" ? rawMatchId : (rawMatchId?.[0] ?? "");

  const currentMatch =
    useAppStore((state) => findMatchById(state, resolvedMatchId)) ?? null;
  const existingLineup = useAppStore((state) =>
    findLineupByMatchId(state, resolvedMatchId),
  );

  const isReadOnly = !canManage;

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
        (player) => attendanceByPlayerId.get(player.id) === "confirmed",
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
    () => confirmedPlayers.map((player) => player.id).join("|"),
    [confirmedPlayers],
  );
  const publishedPlayersKey = useMemo(
    () => publishedPlayers.map((player) => player.id).join("|"),
    [publishedPlayers],
  );

  const absentCount = useMemo(
    () =>
      players.filter(
        (player) => attendanceByPlayerId.get(player.id) === "absent",
      ).length,
    [attendanceByPlayerId, players],
  );

  const pendingCount = useMemo(
    () =>
      players.filter((player) => {
        const status = attendanceByPlayerId.get(player.id);
        return status == null || status === "pending";
      }).length,
    [attendanceByPlayerId, players],
  );

  const initialDraft = useMemo<LocalLineupState>(
    () => ({
      formationKey: fallbackPreset?.key ?? "",
      starters: [],
      benchPlayerIds: [],
    }),
    [fallbackPreset?.key],
  );

  const [draft, setDraft] = useState<LocalLineupState>(initialDraft);
  const [isDragging, setIsDragging] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("clean");

  const draftRef = useRef<LocalLineupState>(initialDraft);
  const sourceKeyRef = useRef("");
  const isDirtyRef = useRef(false);
  const isDraggingRef = useRef(false);

  const handleDragStateChange = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
    setIsDragging(dragging);
  }, []);

  const applyDraft = useCallback(
    (
      next: LocalLineupState,
      options?: { markDirty?: boolean; saveStatus?: SaveStatus },
    ) => {
      draftRef.current = next;
      setDraft(next);

      if (options?.markDirty === false) {
        isDirtyRef.current = false;
      } else {
        isDirtyRef.current = true;
      }

      setSaveStatus(
        options?.saveStatus ??
          (options?.markDirty === false ? "clean" : "dirty"),
      );
    },
    [],
  );

  useEffect(() => {
    if (!currentMatch || !fallbackPreset) {
      return;
    }

    if (isDraggingRef.current || isDragging) {
      return;
    }

    const sourceKey = [
      currentMatch.id,
      fallbackPreset.key,
      existingLineup?.id ?? "no-lineup",
      existingLineup?.updatedAt ?? "no-lineup-update",
      canManage ? confirmedPlayersKey : publishedPlayersKey,
    ].join("__");

    if (sourceKey === sourceKeyRef.current) {
      return;
    }

    if (isDirtyRef.current) {
      sourceKeyRef.current = sourceKey;
      return;
    }

    const nextDraft = buildLineupStateFromSource({
      existingLineup,
      preset: fallbackPreset,
      players: canManage ? confirmedPlayers : publishedPlayers,
    });

    if (!areLineupStatesEqual(draftRef.current, nextDraft)) {
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }

    setSaveStatus("clean");
    sourceKeyRef.current = sourceKey;
  }, [
    canManage,
    confirmedPlayers,
    confirmedPlayersKey,
    currentMatch,
    existingLineup,
    fallbackPreset,
    isDragging,
    publishedPlayers,
    publishedPlayersKey,
  ]);

  const readOnlyLineup = useMemo<LocalLineupState | null>(() => {
    if (!existingLineup || !fallbackPreset) {
      return null;
    }

    return buildLineupStateFromSource({
      existingLineup,
      preset: fallbackPreset,
      players: publishedPlayers,
    });
  }, [existingLineup, fallbackPreset, publishedPlayers]);

  const lineupState = canManage ? draft : readOnlyLineup;
  const lineupPlayers = canManage ? confirmedPlayers : publishedPlayers;
  const hasUnsavedChanges =
    canManage && (saveStatus === "dirty" || saveStatus === "saving");

  usePreventRemove(hasUnsavedChanges, (event) => {
    Alert.alert(
      "Escalacao nao salva",
      "Voce tem alteracoes pendentes na escalacao. Deseja sair sem salvar?",
      [
        { text: "Continuar editando", style: "cancel" },
        {
          text: "Sair sem salvar",
          style: "destructive",
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
        formationKey: draftRef.current.formationKey || fallbackPreset?.key || "",
        starters: next.starters,
        benchPlayerIds: next.benchPlayerIds,
      });
    },
    [applyDraft, canManage, fallbackPreset?.key],
  );

  const handleAutoArrange = useCallback(
    (nextPresetKey?: string) => {
      if (!canManage || !fallbackPreset) {
        return;
      }

      const preset =
        presets.find(
          (item) =>
            item.key === (nextPresetKey ?? draftRef.current.formationKey),
        ) ?? fallbackPreset;

      const autoLineup = buildLineupFromPreset(preset, confirmedPlayers);

      applyDraft({
        formationKey: preset.key,
        starters: autoLineup.starters,
        benchPlayerIds: autoLineup.benchPlayerIds,
      });
    },
    [applyDraft, canManage, confirmedPlayers, fallbackPreset, presets],
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

    try {
      setSaveStatus("saving");

      await saveLineup({
        matchId: currentMatch.id,
        formationKey: draftRef.current.formationKey || fallbackPreset.key,
        starters: draftRef.current.starters,
        benchPlayerIds: draftRef.current.benchPlayerIds,
      });

      isDirtyRef.current = false;
      setSaveStatus("saved");

      Alert.alert(
        "Escalacao salva",
        "A distribuicao dos jogadores foi atualizada com sucesso.",
      );
    } catch (error) {
      setSaveStatus("dirty");

      Alert.alert(
        "Nao foi possivel salvar",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    }
  }, [canManage, currentMatch, fallbackPreset, saveLineup]);

  if (!currentMatch || !team) {
    return (
      <Screen>
        <EmptyState
          title="Escalacao indisponivel"
          description="Nao foi possivel encontrar esta partida ou o time ativo."
        />
      </Screen>
    );
  }

  if (!fallbackPreset) {
    return (
      <Screen>
        <EmptyState
          title="Sem formacao disponivel"
          description="Ainda nao encontramos uma formacao compativel com este tipo de partida."
        />
      </Screen>
    );
  }

  if (isReadOnly && !existingLineup) {
    return (
      <Screen>
        <EmptyState
          title="Escalacao ainda nao publicada"
          description="O administrador ainda nao salvou a escalacao desta partida."
        />
      </Screen>
    );
  }

  if (
    canManage &&
    (currentMatch.status === "finished" || currentMatch.status === "canceled")
  ) {
    return (
      <Screen>
        <EmptyState
          title="Escalacao bloqueada"
          description="A escalacao pode ser ajustada apenas antes do encerramento da partida."
        />
      </Screen>
    );
  }

  if (canManage && confirmedPlayers.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Sem jogadores confirmados"
          description="Confirme a presenca do elenco antes de montar a escalacao."
        />
      </Screen>
    );
  }

  if (!lineupState) {
    return (
      <Screen>
        <EmptyState
          title="Escalacao indisponivel"
          description="Nao foi possivel carregar a escalacao desta partida."
        />
      </Screen>
    );
  }

  const starterLimit = currentMatch.linePlayersCount + 1;

  return (
    <Screen keyboardAware={false} scrollEnabled={!isDragging}>
      <SectionHeader
        title="Escalacao visual"
        subtitle={`${currentMatch.opponentName} - ${starterLimit} em campo`}
      />

      <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
        {canManage
          ? "Arraste jogadores apenas dentro do campo. O banco usa toque para adicionar/remover, evitando troca automatica."
          : "Somente visualizacao. Apenas administradores podem alterar a escalacao."}
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
              : `${lineupPlayers.length} na escalacao`
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
                : saveStatus === "saved"
                  ? theme.colors.success
                  : saveStatus === "dirty"
                    ? theme.colors.warning
                    : theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.statusTitle, { color: theme.colors.text }]}>
          {!canManage
            ? "Somente visualizacao"
            : saveStatus === "saving"
              ? "Salvando..."
              : saveStatus === "saved"
                ? "Escalacao salva"
                : saveStatus === "dirty"
                  ? "Escalacao nao salva"
                  : "Escalacao pronta"}
        </Text>

        <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>
          {!canManage
            ? "Apenas administradores podem organizar, limpar ou salvar a escalacao."
            : saveStatus === "saving"
              ? "Persistindo a distribuicao atual no time."
              : saveStatus === "saved"
                ? "As coordenadas atuais ja estao sincronizadas."
                : saveStatus === "dirty"
                  ? "Voce tem alteracoes pendentes. So enviamos para o banco ao tocar em salvar."
                  : "Mova jogadores livremente e salve apenas quando terminar."}
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
            label="Limpar escalacao"
            variant="ghost"
            onPress={handleClearLineup}
          />
          <AppButton
            label="Salvar escalacao"
            loading={saveStatus === "saving"}
            onPress={() => void handleSave()}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  helper: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    fontWeight: "800",
  },
  statusText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  formationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});

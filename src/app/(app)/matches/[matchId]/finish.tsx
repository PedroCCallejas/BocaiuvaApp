import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
import { AppButton } from '@/components/ui/AppButton';
import { CounterField } from '@/components/ui/CounterField';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppInput } from '@/components/ui/AppInput';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatCurrencyBRL, parseCurrencyInputToNumber } from '@/lib/field-cost';
import { calculateMatchResult, getConfirmedPlayers } from '@/lib/match';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectCurrentMembership,
  selectCurrentTeam,
} from '@/store/selectors';

type PlayerStatDraft = { goals: number; assists: number; played: boolean };

function buildPlayerStatsState(
  playerIds: string[],
  existingStats: Array<{ playerId: string; goals: number; assists: number; played?: boolean }>,
) {
  return playerIds.reduce<Record<string, PlayerStatDraft>>((acc, playerId) => {
    const stat = existingStats.find((item) => item.playerId === playerId);
    acc[playerId] = {
      goals: stat?.goals ?? 0,
      assists: stat?.assists ?? 0,
      played: stat ? stat.played !== false : true,
    };
    return acc;
  }, {});
}

function sumGoals(playerStats: Record<string, PlayerStatDraft>) {
  return Object.values(playerStats).reduce(
    (sum, item) => sum + (item.played ? Math.max(item.goals, 0) : 0),
    0,
  );
}

function sumAssists(playerStats: Record<string, PlayerStatDraft>) {
  return Object.values(playerStats).reduce(
    (sum, item) => sum + (item.played ? Math.max(item.assists, 0) : 0),
    0,
  );
}

function formatDecimalInput(value: number) {
  return value.toFixed(2).replace('.', ',');
}

export default function FinishMatchScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const finishMatch = useAppStore((state) => state.finishMatch);
  const updateFinishedMatchStats = useAppStore((state) => state.updateFinishedMatchStats);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const currentMembership = useAppStore(selectCurrentMembership);
  const currentMatch = match ?? null;

  const canManage = useMemo(() => {
    if (!currentMatch) return false;
    const matchMembership = snapshot.teamMembers.find(
      (m) =>
        m.userId === currentUserId &&
        m.teamId === currentMatch.teamId &&
        m.status === 'active',
    );
    const target = matchMembership ?? currentMembership;
    return (
      (target?.canManageTeam === true) ||
      (Array.isArray(target?.roles) && target.roles.includes('admin'))
    );
  }, [currentMatch, currentMembership, currentUserId, snapshot.teamMembers]);
  const confirmedPlayers = useMemo(
    () => (currentMatch ? getConfirmedPlayers(snapshot, currentMatch.id) : []),
    [currentMatch, snapshot],
  );
  const existingStats = useMemo(
    () =>
      currentMatch
        ? snapshot.matchStats.filter((item) => item.matchId === currentMatch.id)
        : [],
    [currentMatch, snapshot.matchStats],
  );
  const confirmedPlayerIds = useMemo(
    () => confirmedPlayers.map((player) => player.id),
    [confirmedPlayers],
  );
  const initialPlayerStats = useMemo(
    () => buildPlayerStatsState(confirmedPlayerIds, existingStats),
    [confirmedPlayerIds, existingStats],
  );
  const initialOwnGoalsForTeam = currentMatch?.scoreboard?.ownGoalsForTeam ?? 0;
  const initialComputedTeamGoals = useMemo(
    () => sumGoals(initialPlayerStats) + initialOwnGoalsForTeam,
    [initialOwnGoalsForTeam, initialPlayerStats],
  );
  const [teamScore, setTeamScore] = useState(
    currentMatch?.scoreboard?.team ?? initialComputedTeamGoals,
  );
  const [opponentScore, setOpponentScore] = useState(currentMatch?.scoreboard?.opponent ?? 0);
  const [ownGoalsForTeam, setOwnGoalsForTeam] = useState(initialOwnGoalsForTeam);
  const [teamScoreManuallyEdited, setTeamScoreManuallyEdited] = useState(false);
  const [playerStats, setPlayerStats] = useState(initialPlayerStats);
  const [fieldCostTotalAmount, setFieldCostTotalAmount] = useState(
    currentMatch?.fieldCost ? formatDecimalInput(currentMatch.fieldCost.totalAmount) : '',
  );
  const [fieldCostSplitCount, setFieldCostSplitCount] = useState(
    String(currentMatch?.fieldCost?.splitCount ?? confirmedPlayers.length),
  );
  const [fieldCostNote, setFieldCostNote] = useState(currentMatch?.fieldCost?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentMatch) {
      return;
    }

    setPlayerStats(initialPlayerStats);
    setOwnGoalsForTeam(initialOwnGoalsForTeam);
    setOpponentScore(currentMatch.scoreboard?.opponent ?? 0);
    setTeamScore(currentMatch.scoreboard?.team ?? initialComputedTeamGoals);
    setTeamScoreManuallyEdited(false);
    setFieldCostTotalAmount(
      currentMatch.fieldCost ? formatDecimalInput(currentMatch.fieldCost.totalAmount) : '',
    );
    setFieldCostSplitCount(String(currentMatch.fieldCost?.splitCount ?? confirmedPlayers.length));
    setFieldCostNote(currentMatch.fieldCost?.note ?? '');
  }, [
    confirmedPlayers.length,
    currentMatch?.id,
    currentMatch?.fieldCost,
    currentMatch?.scoreboard?.opponent,
    currentMatch?.scoreboard?.team,
    initialComputedTeamGoals,
    initialOwnGoalsForTeam,
    initialPlayerStats,
  ]);

  const totalPlayerGoals = useMemo(() => sumGoals(playerStats), [playerStats]);
  const totalAssists = useMemo(() => sumAssists(playerStats), [playerStats]);
  const totalTeamGoals = totalPlayerGoals + ownGoalsForTeam;
  const hasFieldCostInput = fieldCostTotalAmount.trim().length > 0;
  const parsedFieldCostTotalAmount = useMemo(
    () => parseCurrencyInputToNumber(fieldCostTotalAmount),
    [fieldCostTotalAmount],
  );
  const parsedFieldCostSplitCount = useMemo(() => {
    const normalized = fieldCostSplitCount.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }, [fieldCostSplitCount]);
  const fieldCostAmountPerPlayer = useMemo(() => {
    if (
      parsedFieldCostTotalAmount == null ||
      parsedFieldCostTotalAmount < 0 ||
      parsedFieldCostSplitCount == null ||
      parsedFieldCostSplitCount <= 0
    ) {
      return null;
    }

    return Math.round((parsedFieldCostTotalAmount / parsedFieldCostSplitCount) * 100) / 100;
  }, [parsedFieldCostSplitCount, parsedFieldCostTotalAmount]);

  useEffect(() => {
    if (!teamScoreManuallyEdited) {
      setTeamScore(totalTeamGoals);
    }
  }, [teamScoreManuallyEdited, totalTeamGoals]);

  const resultLabel = useMemo(() => {
    const result = calculateMatchResult(teamScore, opponentScore);
    if (result === 'win') {
      return 'Vitória';
    }
    if (result === 'loss') {
      return 'Derrota';
    }
    return 'Empate';
  }, [opponentScore, teamScore]);

  const hasTeamScoreWarning = teamScore !== totalTeamGoals;
  const hasAssistsWarning = totalAssists > totalPlayerGoals;

  const updatePlayerStat = useCallback(
    (playerId: string, key: 'goals' | 'assists', value: number) => {
      setPlayerStats((current) => ({
        ...current,
        [playerId]: {
          goals: key === 'goals' ? value : current[playerId]?.goals ?? 0,
          assists: key === 'assists' ? value : current[playerId]?.assists ?? 0,
          played: current[playerId]?.played ?? true,
        },
      }));
    },
    [],
  );

  const togglePlayerPlayed = useCallback((playerId: string, played: boolean) => {
    setPlayerStats((current) => {
      const currentStat = current[playerId] ?? { goals: 0, assists: 0, played: true };

      if (!played && (currentStat.goals > 0 || currentStat.assists > 0)) {
        setSaveError(
          'Remova explicitamente os gols e assistências antes de marcar que o jogador não participou.',
        );
        return current;
      }

      setSaveError(null);
      return {
        ...current,
        [playerId]: {
          ...currentStat,
          played,
        },
      };
    });
  }, []);

  const handleTeamScoreChange = useCallback((value: number) => {
    setTeamScoreManuallyEdited(true);
    setTeamScore(value);
  }, []);

  const handleUseAutomaticScore = useCallback(() => {
    setTeamScoreManuallyEdited(false);
    setTeamScore(totalTeamGoals);
  }, [totalTeamGoals]);

  async function handleSave() {
    if (!currentMatch || saving) {
      return;
    }

    const isReEdit = currentMatch.status === 'finished';

    if (__DEV__) {
      console.log('[finish-match] button pressed', {
        matchId: currentMatch.id,
        mode: isReEdit ? 'edit-finished' : 'finish',
        teamId: currentMatch.teamId,
        uid: currentUserId,
        canManageUI: canManage,
        membershipCanManageTeam: currentMembership?.canManageTeam,
        membershipRoles: currentMembership?.roles,
      });
    }

    let nextFieldCost = null;

    if (hasFieldCostInput) {
      if (parsedFieldCostTotalAmount == null || parsedFieldCostTotalAmount < 0) {
        if (__DEV__) console.log('[finish-match] validation fail: invalid field cost amount');
        setSaveError('Valor do campo inválido. Informe um valor total maior ou igual a zero.');
        return;
      }

      if (parsedFieldCostSplitCount == null || parsedFieldCostSplitCount <= 0) {
        if (__DEV__) console.log('[finish-match] validation fail: invalid split count');
        setSaveError('Divisão inválida. Informe em quantas pessoas o valor do campo será dividido.');
        return;
      }

      nextFieldCost = {
        totalAmount: parsedFieldCostTotalAmount,
        splitCount: parsedFieldCostSplitCount,
        note: fieldCostNote.trim() || null,
      };
    }

    const payload = {
      matchId: currentMatch.id,
      teamScore,
      opponentScore,
      ownGoalsForTeam,
      fieldCost: nextFieldCost,
      playerStats: confirmedPlayers.map((player) => ({
        playerId: player.id,
        goals: playerStats[player.id]?.goals ?? 0,
        assists: playerStats[player.id]?.assists ?? 0,
        played: playerStats[player.id]?.played ?? true,
      })),
    };

    if (payload.playerStats.every((stat) => !stat.played)) {
      setSaveError('A partida precisa ter pelo menos um jogador participante.');
      return;
    }

    if (__DEV__) console.log('[finish-match] payload', { ...payload, mode: isReEdit ? 'edit-finished' : 'finish' });

    if (__DEV__) console.log('[finish-match] save start', { matchId: currentMatch.id, mode: isReEdit ? 'edit-finished' : 'finish' });
    setSaving(true);
    setSaveError(null);
    try {
      if (isReEdit) {
        if (__DEV__) console.log('[finish-match] mode edit-finished');
        await updateFinishedMatchStats(payload);
      } else {
        if (__DEV__) console.log('[finish-match] mode finish');
        await finishMatch(payload);
      }
      if (__DEV__) console.log('[finish-match] principal save success', { matchId: currentMatch.id, mode: isReEdit ? 'edit-finished' : 'finish' });
      router.replace(`/matches/${currentMatch.id}`);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      if (__DEV__) {
        console.error('[finish-match] save failed', {
          mode: isReEdit ? 'edit-finished' : 'finish',
          code: errorCode,
          message: errorMessage,
        });
      }
      if (errorCode === 'permission-denied') {
        const matchTeam = snapshot.teams.find((t) => t.id === currentMatch.teamId);
        const matchTeamName = matchTeam?.name ?? 'este time';
        const activeTeamName = team?.name ?? null;
        const teamInfo =
          activeTeamName && activeTeamName !== matchTeamName
            ? ` (time ativo: ${activeTeamName})`
            : '';
        setSaveError(
          isReEdit
            ? `Sem permissão de admin para "${matchTeamName}"${teamInfo}. Se o erro persistir, o administrador deve executar uma sincronização de índice.`
            : `Sem permissão de admin para "${matchTeamName}"${teamInfo}. Se o erro persistir, o administrador deve executar uma sincronização de índice.`,
        );
      } else {
        setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!currentMatch || !canManage || !team) {
    return (
      <Screen>
        <EmptyState
          title="Pós-jogo indisponível"
          description="Apenas o administrador do time pode encerrar a partida."
        />
      </Screen>
    );
  }

  if (confirmedPlayers.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Sem jogadores confirmados"
          description="Confirme a presença do elenco antes de registrar o pós-jogo."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {currentMatch.status === 'finished'
            ? 'Editar estatísticas do jogo'
            : 'Encerrar partida'}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {currentMatch.status === 'finished'
            ? 'Ajuste placar, gols, assistências e gol contra a favor sem apagar MVP ou avaliações.'
            : 'O placar do time é preenchido automaticamente pela soma dos gols dos jogadores e dos gols contra do adversário.'}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard
          label="Gols lançados"
          value={String(totalPlayerGoals)}
          helper="somados dos jogadores"
        />
        <MetricCard
          label="Assistências"
          value={String(totalAssists)}
          helper="lancadas na partida"
        />
        <MetricCard
          label="Placar atual"
          value={`${teamScore} x ${opponentScore}`}
          helper={resultLabel}
        />
      </View>

      {hasTeamScoreWarning ? (
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.warning,
            },
          ]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
            Placar diferente da soma dos gols
          </Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
            O time está com {teamScore} gol(s), mas a soma dos gols lançados mais gols contra
            a favor resulta em {totalTeamGoals}.
          </Text>
          <AppButton
            label="Usar soma automática"
            variant="secondary"
            onPress={handleUseAutomaticScore}
          />
        </View>
      ) : null}

      {hasAssistsWarning ? (
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.warning,
            },
          ]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
            Confira as assistências
          </Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
            Existem mais assistências que gols lançados. Confira se está correto antes de
            salvar.
          </Text>
        </View>
      ) : null}

      <View style={styles.scoreRow}>
        <CounterField
          label="Gols do time"
          value={teamScore}
          min={0}
          max={30}
          onChange={handleTeamScoreChange}
        />
        <CounterField
          label="Gols tomados"
          value={opponentScore}
          min={0}
          max={30}
          onChange={setOpponentScore}
        />
        <CounterField
          label="Gols contra a nosso favor"
          value={ownGoalsForTeam}
          min={0}
          max={30}
          onChange={setOwnGoalsForTeam}
        />
      </View>

      <View
        style={[
          styles.fieldCostCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <SectionHeader
          title="Valor do campo"
          subtitle="Opcional. Se quiser, o app já calcula quanto fica para cada pessoa."
        />
        <View style={styles.fieldCostInputs}>
          <AppInput
            label="Valor total do campo"
            value={fieldCostTotalAmount}
            onChangeText={setFieldCostTotalAmount}
            placeholder="120,00"
            keyboardType="decimal-pad"
          />
          <AppInput
            label="Dividir entre quantas pessoas"
            value={fieldCostSplitCount}
            onChangeText={(value) => setFieldCostSplitCount(value.replace(/[^\d]/g, ''))}
            placeholder={String(confirmedPlayers.length)}
            keyboardType="number-pad"
          />
          <AppInput
            label="Observação opcional"
            value={fieldCostNote}
            onChangeText={setFieldCostNote}
            placeholder="Ex.: incluir goleiro convidado"
            multiline
            numberOfLines={3}
            style={styles.noteInput}
          />
        </View>
        <View
          style={[
            styles.fieldCostSummary,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}>
          <Text style={[styles.fieldCostSummaryTitle, { color: theme.colors.text }]}>
            Cada um paga
          </Text>
          <Text style={[styles.fieldCostSummaryValue, { color: theme.colors.secondary }]}>
            {fieldCostAmountPerPlayer != null
              ? `${formatCurrencyBRL(fieldCostAmountPerPlayer)}`
              : 'Preencha valor e divisão'}
          </Text>
          <Text style={[styles.fieldCostSummaryHint, { color: theme.colors.textMuted }]}>
            {fieldCostAmountPerPlayer != null
              ? `${formatCurrencyBRL(parsedFieldCostTotalAmount ?? 0)} dividido por ${parsedFieldCostSplitCount} pessoa(s).`
              : `Sugestão inicial: dividir entre ${confirmedPlayers.length} jogador(es) confirmados.`}
          </Text>
        </View>
      </View>

      <SectionHeader title="Resultado" subtitle={resultLabel} />

      {confirmedPlayers.map((player) => {
        const played = playerStats[player.id]?.played ?? true;

        return (
          <View
            key={player.id}
            style={[
              styles.playerRow,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: played ? 1 : 0.72,
              },
            ]}>
            <View style={styles.playerHeaderRow}>
              <View style={styles.playerCopy}>
                <Text style={[styles.playerName, { color: theme.colors.text }]}>
                  #{player.jerseyNumber} {player.nickname}
                </Text>
                <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
                  {player.fullName}
                </Text>
              </View>
              <View style={styles.playedToggle}>
                <Text style={[styles.playedToggleLabel, { color: theme.colors.textMuted }]}>
                  Jogou
                </Text>
                <Switch
                  accessibilityLabel={`Participou da partida: ${player.nickname}`}
                  value={played}
                  onValueChange={(value) => togglePlayerPlayed(player.id, value)}
                  trackColor={{
                    false: theme.colors.border,
                    true: theme.colors.secondary,
                  }}
                />
              </View>
            </View>
            {played ? (
              <View style={styles.counterRow}>
                <CounterField
                  label="Gols"
                  value={playerStats[player.id]?.goals ?? 0}
                  min={0}
                  onChange={(value) => updatePlayerStat(player.id, 'goals', value)}
                />
                <CounterField
                  label="Assistências"
                  value={playerStats[player.id]?.assists ?? 0}
                  min={0}
                  onChange={(value) => updatePlayerStat(player.id, 'assists', value)}
                />
              </View>
            ) : (
              <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
                Confirmou presença, mas não entra na contagem de jogos desta partida.
              </Text>
            )}
          </View>
        );
      })}

      {saveError ? (
        <Text style={[styles.saveError, { color: theme.colors.danger }]}>{saveError}</Text>
      ) : null}

      <AppButton
        label={currentMatch.status === 'finished' ? 'Salvar estatísticas' : 'Encerrar jogo'}
        onPress={handleSave}
        loading={saving}
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  noticeTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  fieldCostCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  fieldCostInputs: {
    gap: 12,
  },
  noteInput: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  fieldCostSummary: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  fieldCostSummaryTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  fieldCostSummaryValue: {
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: '900',
  },
  fieldCostSummaryHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  playerRow: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  playerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  playedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playedToggleLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  playerCopy: {
    gap: 4,
  },
  playerName: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  playerSub: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  counterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  saveError: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});

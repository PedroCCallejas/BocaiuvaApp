import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { CounterField } from '@/components/ui/CounterField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  buildRatingCriteriaSnapshot,
  calculateOverallFromCriteriaScores,
  DEFAULT_RATING_SCORE,
  MAX_RATING_SCORE,
  MIN_RATING_SCORE,
  normalizePlayerRatingForDisplay,
} from '@/lib/rating-criteria';
import {
  findPlayerRating,
  getConfirmedPlayers,
  getRatingsSummary,
  isPlayerConfirmedForMatch,
} from '@/lib/match';
import { formatStatNumber, getCriteriaSummaryEntries } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectActiveTeamRatingCriteria,
  selectCanManageTeam,
  selectCurrentPlayer,
  selectCurrentTeamRatingCriteria,
} from '@/store/selectors';
import type {
  PlayerRating,
  TeamRatingCriterion,
} from '@/types/domain';

function buildCriteriaState(
  criteria: TeamRatingCriterion[],
  source?: Record<string, number> | null,
) {
  return criteria.reduce<Record<string, number>>((acc, criterion) => {
    const value = source?.[criterion.id];
    acc[criterion.id] =
      typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_RATING_SCORE;
    return acc;
  }, {});
}

function buildRatingEntries(
  rating: PlayerRating,
  currentCriteria: TeamRatingCriterion[],
) {
  const normalized = normalizePlayerRatingForDisplay(rating, currentCriteria);

  return Object.entries(normalized.criteriaSnapshot)
    .map(([criterionId, snapshot]) => ({
      criterionId,
      label: snapshot.label,
      type: snapshot.type,
      value: normalized.criteriaScores[criterionId] ?? DEFAULT_RATING_SCORE,
      order: snapshot.order,
    }))
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.label.localeCompare(right.label);
    });
}

export default function MatchRatingsScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const teamCriteria = useAppStore(selectCurrentTeamRatingCriteria);
  const activeCriteria = useAppStore(selectActiveTeamRatingCriteria);
  const submitPlayerRating = useAppStore((state) => state.submitPlayerRating);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>(() =>
    buildCriteriaState(activeCriteria),
  );

  const criteriaSnapshot = useMemo(
    () => buildRatingCriteriaSnapshot(activeCriteria),
    [activeCriteria],
  );

  useEffect(() => {
    if (!selectedPlayerId) {
      setCriteriaScores(buildCriteriaState(activeCriteria));
    }
  }, [activeCriteria, selectedPlayerId]);

  if (!match || match.status !== 'finished') {
    return (
      <Screen>
        <EmptyState
          title="Avaliacoes indisponiveis"
          description="As notas anônimas só ficam disponíveis após o encerramento da partida."
        />
      </Screen>
    );
  }

  if (activeCriteria.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Sem critérios ativos"
          description="O time ainda não configurou critérios ativos para avaliar os jogadores."
          actionLabel={canManageTeam ? 'Configurar critérios' : undefined}
          onAction={canManageTeam ? () => router.push('/team-rating-criteria' as never) : undefined}
        />
      </Screen>
    );
  }

  const currentMatch = match;
  const confirmedPlayers = getConfirmedPlayers(snapshot, currentMatch.id);
  const eligibleToRate = confirmedPlayers.filter((player) => player.id !== currentPlayer?.id);
  const canRate =
    eligibleToRate.length > 0 &&
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id);
  const ratingsSummary = getRatingsSummary(snapshot, currentMatch.id);
  const playerById = useMemo(
    () => new Map(confirmedPlayers.map((player) => [player.id, player])),
    [confirmedPlayers],
  );
  const rankingItems = ratingsSummary.map((item) => {
    const player = playerById.get(item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: `${item.totalRatings} avaliação(ões)`,
      value: item.overallAverage,
      valueLabel: formatStatNumber(item.overallAverage, 1),
    };
  });
  const unratedPlayers = eligibleToRate.filter(
    (player) =>
      !findPlayerRating(snapshot, currentMatch.id, currentPlayer?.id, player.id),
  );
  const selectedPlayer = eligibleToRate.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedExistingRating = selectedPlayerId
    ? findPlayerRating(snapshot, currentMatch.id, currentPlayer?.id, selectedPlayerId)
    : null;
  const selectedPlayerSummary = selectedPlayerId
    ? ratingsSummary.find((item) => item.playerId === selectedPlayerId) ?? null
    : null;
  const overallPreview = useMemo(
    () =>
      calculateOverallFromCriteriaScores({
        criteriaScores,
        criteriaSnapshot,
      }),
    [criteriaScores, criteriaSnapshot],
  );
  const existingRatingEntries = useMemo(
    () =>
      selectedExistingRating
        ? buildRatingEntries(selectedExistingRating, teamCriteria)
        : [],
    [selectedExistingRating, teamCriteria],
  );
  const selectedExistingRatingOverall = selectedExistingRating
    ? normalizePlayerRatingForDisplay(selectedExistingRating, teamCriteria).overall
    : null;
  const displayedCriteriaEntries = selectedExistingRating
    ? existingRatingEntries
    : activeCriteria.map((criterion) => ({
        criterionId: criterion.id,
        label: criterion.label,
        type: criterion.type,
        value: criteriaScores[criterion.id] ?? DEFAULT_RATING_SCORE,
      }));

  const handleSelectPlayer = useCallback(
    (playerId: string) => {
      const existingRating = findPlayerRating(
        snapshot,
        currentMatch.id,
        currentPlayer?.id,
        playerId,
      );
      setSelectedPlayerId(playerId);
      setCriteriaScores(
        buildCriteriaState(
          activeCriteria,
          existingRating
            ? normalizePlayerRatingForDisplay(existingRating, teamCriteria).criteriaScores
            : null,
        ),
      );
    },
    [activeCriteria, currentMatch.id, currentPlayer?.id, snapshot, teamCriteria],
  );

  async function handleSubmit() {
    if (!selectedPlayerId || selectedExistingRating) {
      return;
    }

    try {
      await submitPlayerRating({
        matchId: currentMatch.id,
        targetPlayerId: selectedPlayerId,
        criteriaScores,
      });
      setSelectedPlayerId(null);
      setCriteriaScores(buildCriteriaState(activeCriteria));
    } catch (error) {
      Alert.alert(
        'Não foi possível salvar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Como funcionam as notas</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Cada critério recebe nota de {MIN_RATING_SCORE} a {MAX_RATING_SCORE}. A média geral
          combina os critérios ativos do time sem revelar quem avaliou quem.
        </Text>
      </View>

      {canRate ? (
        <>
          <SectionHeader
            title="Escolha um jogador"
            subtitle={`${unratedPlayers.length} jogador(es) ainda não avaliados por você`}
          />
          <View style={styles.targetWrap}>
            {eligibleToRate.map((player) => {
              const existingRating = findPlayerRating(
                snapshot,
                currentMatch.id,
                currentPlayer?.id,
                player.id,
              );
              const selected = selectedPlayerId === player.id;

              return (
                <Pressable
                  key={player.id}
                  onPress={() => handleSelectPlayer(player.id)}
                  style={[
                    styles.targetCard,
                    {
                      backgroundColor: selected
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.targetName, { color: theme.colors.text }]}>
                    #{player.jerseyNumber} {player.nickname}
                  </Text>
                  <Text style={[styles.targetSub, { color: theme.colors.textMuted }]}>
                    {existingRating ? 'Já avaliado por você' : 'Pronto para avaliar'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedPlayer ? (
            <View style={styles.formSection}>
              <SectionHeader
                title={
                  selectedExistingRating
                    ? `Sua avaliação de ${selectedPlayer.nickname}`
                    : `Avaliando ${selectedPlayer.nickname}`
                }
                subtitle={
                  selectedExistingRating
                    ? `Nota geral enviada: ${formatStatNumber(selectedExistingRatingOverall ?? 0, 1)}`
                    : `Nota geral prevista: ${formatStatNumber(overallPreview, 1)}`
                }
              />

              <View style={styles.criteriaGrid}>
                {displayedCriteriaEntries.map((criterion) => {
                  return (
                    <View
                      key={criterion.criterionId}
                      style={[
                        styles.criteriaSummaryCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}>
                      <Text style={[styles.criteriaLabel, { color: theme.colors.text }]}>
                        {criterion.label}
                      </Text>
                      <Text style={[styles.criteriaValue, { color: theme.colors.text }]}>
                        {formatStatNumber(criterion.value, 1)}
                      </Text>
                      <Text style={[styles.criteriaMeta, { color: theme.colors.textMuted }]}>
                        {criterion.type === 'negative'
                          ? 'Comportamento de alerta'
                          : 'Contribuição positiva'}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {selectedExistingRating ? (
                <View
                  style={[
                    styles.noticeCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
                    Avaliação já enviada
                  </Text>
                  <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
                    Estas são as notas que você já registrou para este jogador nesta partida.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.counterGrid}>
                    {activeCriteria.map((criterion) => (
                      <CounterField
                        key={criterion.id}
                        label={criterion.label}
                        value={criteriaScores[criterion.id] ?? DEFAULT_RATING_SCORE}
                        min={MIN_RATING_SCORE}
                        max={MAX_RATING_SCORE}
                        onChange={(value) =>
                          setCriteriaScores((current) => ({
                            ...current,
                            [criterion.id]: value,
                          }))
                        }
                      />
                    ))}
                  </View>
                  <AppButton label="Salvar avaliação" onPress={handleSubmit} fullWidth />
                </>
              )}

              {selectedPlayerSummary ? (
                <View
                  style={[
                    styles.noticeCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
                    Média anônima da partida
                  </Text>
                  <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
                    Geral {formatStatNumber(selectedPlayerSummary.overallAverage, 1)} com{' '}
                    {selectedPlayerSummary.totalRatings} avaliação(ões).
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <EmptyState
          title={currentPlayer ? 'Somente visualização' : 'Conta não vinculada'}
          description={
            currentPlayer
              ? 'Somente jogadores confirmados podem enviar notas, mas o resumo da partida continua disponível.'
              : 'Vincule sua conta a um jogador para avaliar o elenco. Enquanto isso, você ainda pode ver o resumo anônimo da partida.'
          }
        />
      )}

      {rankingItems.length > 0 ? (
        <>
          <RankingList title="Média geral da partida" items={rankingItems} />
          <View style={styles.summaryList}>
            {ratingsSummary.map((item) => {
              const player = playerById.get(item.playerId);

              if (!player) {
                return null;
              }

              const summaryEntries = getCriteriaSummaryEntries(item);

              return (
                <View
                  key={item.playerId}
                  style={[
                    styles.summaryCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <View style={styles.summaryHeader}>
                    <View style={styles.summaryCopy}>
                      <Text style={[styles.summaryName, { color: theme.colors.text }]}>
                        #{player.jerseyNumber} {player.nickname}
                      </Text>
                      <Text style={[styles.summaryMeta, { color: theme.colors.textMuted }]}>
                        {item.totalRatings} avaliação(ões) anônimas
                      </Text>
                    </View>
                    <Text style={[styles.summaryOverall, { color: theme.colors.text }]}>
                      {formatStatNumber(item.overallAverage, 1)}
                    </Text>
                  </View>
                  <View style={styles.criteriaGrid}>
                    {summaryEntries.map((criterion) => (
                      <View
                        key={`${item.playerId}-${criterion.criterionId}`}
                        style={[
                          styles.criteriaSummaryCard,
                          {
                            backgroundColor: theme.colors.backgroundElevated,
                            borderColor: theme.colors.border,
                          },
                        ]}>
                        <Text style={[styles.criteriaLabel, { color: theme.colors.text }]}>
                          {criterion.label}
                        </Text>
                        <Text style={[styles.criteriaValue, { color: theme.colors.text }]}>
                          {formatStatNumber(criterion.average, 1)}
                        </Text>
                        <Text style={[styles.criteriaMeta, { color: theme.colors.textMuted }]}>
                          {criterion.count} nota(s) •{' '}
                          {criterion.type === 'negative' ? 'quanto menor, melhor' : 'quanto maior, melhor'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : canRate ? (
        <EmptyState
          title="Sem avaliações ainda"
          description="Quando o elenco enviar as notas, a média geral e os critérios por jogador aparecerão aqui."
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  targetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  targetCard: {
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  targetName: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  targetSub: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  formSection: {
    gap: 16,
  },
  criteriaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  criteriaSummaryCard: {
    minWidth: 150,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  criteriaLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  criteriaValue: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '900',
  },
  criteriaMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  counterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  noticeTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryList: {
    gap: 12,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryCopy: {
    flex: 1,
    gap: 4,
  },
  summaryName: {
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: '800',
  },
  summaryMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  summaryOverall: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
  },
});

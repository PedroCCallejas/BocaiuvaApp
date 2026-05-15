import { useMemo, useState } from 'react';
import { Alert, Clipboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
import { PlayerCard } from '@/components/cards/PlayerCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  FOOT_LABELS,
  PLAYER_STATUS_LABELS,
  POSITION_LABELS,
} from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMatchDate, sortMatchesByDate } from '@/lib/date';
import {
  buildPlayerAggregates,
  buildPlayerProfileMetricCards,
  buildRatingSummary,
  formatStatNumber,
  getCriteriaSummaryEntries,
  isDateWithinStatsPeriod,
} from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManagePlayers,
  findPlayerById,
  selectCanManageTeam,
  selectCurrentPlayer,
  selectCurrentTeam,
} from '@/store/selectors';
import type { Match, PlayerRating } from '@/types/domain';

type RatingFilterMode = 'all' | 'year' | 'month' | 'last-games';

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected ? theme.colors.secondarySoft : theme.colors.surface,
          borderColor: selected ? theme.colors.secondary : theme.colors.border,
        },
      ]}>
      <Text style={[styles.filterChipText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function getDateParts(date: string) {
  const [year, month] = date.split('-').map((value) => Number(value));
  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildPlayerRatingTrend(
  ratings: PlayerRating[],
  matchById: Map<string, Match>,
  currentCriteria: ReturnType<typeof useAppStore.getState>['snapshot']['ratingCriteria'],
) {
  if (ratings.length === 0) {
    return null;
  }

  const ratingsByMatchId = ratings.reduce<Record<string, PlayerRating[]>>((acc, rating) => {
    acc[rating.matchId] = [...(acc[rating.matchId] ?? []), rating];
    return acc;
  }, {});
  const matchAverages = Object.entries(ratingsByMatchId)
    .map(([matchId, matchRatings]) => {
      const match = matchById.get(matchId);

      if (!match) {
        return null;
      }

      return {
        matchId,
        match,
        overall: buildRatingSummary(matchRatings, currentCriteria).overallAverage,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => {
      const ordered = sortMatchesByDate([left.match, right.match]);
      return ordered[0]?.id === left.match.id ? -1 : 1;
    });

  if (matchAverages.length === 0) {
    return null;
  }

  const recentWindowSize = Math.min(3, matchAverages.length);
  const recentSlice = matchAverages.slice(-recentWindowSize);
  const previousSlice =
    matchAverages.length > recentWindowSize
      ? matchAverages.slice(-recentWindowSize * 2, -recentWindowSize)
      : matchAverages.slice(0, Math.max(1, Math.floor(matchAverages.length / 2)));
  const recentAverage = average(recentSlice.map((item) => item.overall));
  const previousAverage = average(previousSlice.map((item) => item.overall));
  const delta = Number((recentAverage - previousAverage).toFixed(1));

    return {
      recentAverage: Number(recentAverage.toFixed(1)),
      previousAverage: Number(previousAverage.toFixed(1)),
      delta,
      latestMatchLabel: recentSlice[recentSlice.length - 1]
        ? formatMatchDate(recentSlice[recentSlice.length - 1].match)
        : '',
    };
  }

export default function PlayerDetailsScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const player = useAppStore((state) => findPlayerById(state, String(playerId)));
  const removePlayer = useAppStore((state) => state.removePlayer);
  const reactivatePlayer = useAppStore((state) => state.reactivatePlayer);
  const [filterMode, setFilterMode] = useState<RatingFilterMode>('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  if (!team || !player) {
    return (
      <Screen>
        <EmptyState
          title="Jogador nao encontrado"
          description="O cadastro que voce tentou abrir nao existe mais."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const currentTeam = team;
  const currentPlayerRecord = player;
  const canSelfAccess = currentPlayer?.id === currentPlayerRecord.id;

  if (!canManagePlayers && !canSelfAccess) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Voce so pode abrir o proprio perfil de jogador."
        />
      </Screen>
    );
  }

  const aggregate = buildPlayerAggregates(snapshot, currentTeam.id).find(
    (item) => item.player.id === currentPlayerRecord.id,
  );
  const teamFinishedMatches = sortMatchesByDate(
    snapshot.matches.filter(
      (match) => match.teamId === currentTeam.id && match.status === 'finished',
    ),
  );
  const finishedMatchById = new Map(teamFinishedMatches.map((match) => [match.id, match]));
  const allPlayerRatings = snapshot.playerRatings.filter(
    (rating) =>
      rating.targetPlayerId === currentPlayerRecord.id && finishedMatchById.has(rating.matchId),
  );
  const availableYears = [...new Set(
    allPlayerRatings.map((rating) => getDateParts(finishedMatchById.get(rating.matchId)?.date ?? '').year),
  )]
    .filter((year) => year > 0)
    .sort((left, right) => right - left);
  const resolvedYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] ?? new Date().getFullYear();
  const availableMonths = [...new Set(
    allPlayerRatings
      .filter((rating) => getDateParts(finishedMatchById.get(rating.matchId)?.date ?? '').year === resolvedYear)
      .map((rating) => getDateParts(finishedMatchById.get(rating.matchId)?.date ?? '').month),
  )]
    .filter((month) => month > 0)
    .sort((left, right) => left - right);
  const resolvedMonth = availableMonths.includes(selectedMonth)
    ? selectedMonth
    : availableMonths[0] ?? new Date().getMonth() + 1;
  const filteredRatings = allPlayerRatings.filter((rating) => {
    const match = finishedMatchById.get(rating.matchId);

    if (!match) {
      return false;
    }

    switch (filterMode) {
      case 'year':
        return isDateWithinStatsPeriod(match.date, {
          period: 'year',
          year: resolvedYear,
        });
      case 'month':
        return isDateWithinStatsPeriod(match.date, {
          period: 'month',
          year: resolvedYear,
          month: resolvedMonth,
        });
      case 'last-games': {
        const lastMatchIds = new Set(teamFinishedMatches.slice(-5).map((item) => item.id));
        return lastMatchIds.has(match.id);
      }
      case 'all':
      default:
        return true;
    }
  });
  const ratingSummary = buildRatingSummary(filteredRatings, snapshot.ratingCriteria);
  const aggregateMetricCards = aggregate ? buildPlayerProfileMetricCards(aggregate) : [];
  const criteriaEntries = getCriteriaSummaryEntries(ratingSummary);
  const bestCriterion = [...criteriaEntries].sort(
    (left, right) => right.adjustedAverage - left.adjustedAverage,
  )[0] ?? null;
  const improvementCriterion = [...criteriaEntries].sort(
    (left, right) => left.adjustedAverage - right.adjustedAverage,
  )[0] ?? null;
  const trend = buildPlayerRatingTrend(filteredRatings, finishedMatchById, snapshot.ratingCriteria);
  const linkLabel = currentPlayerRecord.linkedUserId
    ? 'Conta vinculada'
    : currentPlayerRecord.linkedEmail
      ? `E-mail reservado: ${currentPlayerRecord.linkedEmail}`
      : 'Sem conta vinculada';

  function handleCopyInvite() {
    Clipboard.setString(
      `Entre no time ${currentTeam.name} usando o codigo ${currentTeam.inviteCode}.`,
    );
    Alert.alert('Convite copiado', 'A mensagem de convite foi copiada para enviar ao jogador.');
  }

  function handleRemovePlayer() {
    Alert.alert(
      'Remover jogador',
      'Esse jogador vai sair do elenco ativo e nao aparecera mais nas proximas partidas do time.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Remover jogador',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removePlayer(currentPlayerRecord.id);
                router.replace('/players');
              } catch (error) {
                Alert.alert(
                  'Nao foi possivel remover',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  function handleReactivatePlayer() {
    Alert.alert(
      'Reativar jogador',
      'Esse cadastro volta ao elenco ativo, recupera o vinculo com a conta quando existir e entra novamente nas partidas abertas.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Reativar jogador',
          onPress: () => {
            void (async () => {
              try {
                await reactivatePlayer(currentPlayerRecord.id);
                Alert.alert('Jogador reativado', 'O cadastro voltou ao elenco ativo.');
              } catch (error) {
                Alert.alert(
                  'Nao foi possivel reativar',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <SectionHeader
        title={`#${currentPlayerRecord.jerseyNumber} ${currentPlayerRecord.nickname}`}
        subtitle={currentPlayerRecord.fullName}
        actionLabel="Editar"
        onAction={() => router.push(`/players/${currentPlayerRecord.id}/edit`)}
      />

      <PlayerCard player={currentPlayerRecord} />

      <View style={styles.buttonRow}>
        <AppButton
          label={canManagePlayers ? 'Editar jogador' : 'Editar meu perfil'}
          onPress={() => router.push(`/players/${currentPlayerRecord.id}/edit`)}
        />
        {canManageTeam ? (
          <AppButton label="Copiar convite" variant="secondary" onPress={handleCopyInvite} />
        ) : null}
        {canManagePlayers ? (
          currentPlayerRecord.status === 'inactive' || currentPlayerRecord.deletedAt ? (
            <AppButton label="Reativar jogador" onPress={handleReactivatePlayer} />
          ) : (
            <AppButton label="Remover jogador" variant="danger" onPress={handleRemovePlayer} />
          )
        ) : null}
      </View>

      <View
        style={[
          styles.infoCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.infoTitle, { color: theme.colors.text }]}>Resumo do cadastro</Text>
        <View style={styles.pillWrap}>
          <Pill label={PLAYER_STATUS_LABELS[currentPlayerRecord.status]} color={theme.colors.secondary} />
          <Pill label={POSITION_LABELS[currentPlayerRecord.primaryPosition]} color={theme.colors.primary} />
          <Pill label={FOOT_LABELS[currentPlayerRecord.dominantFoot]} color={theme.colors.accent} />
        </View>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{linkLabel}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Posicoes secundarias:{' '}
          {currentPlayerRecord.secondaryPositions.length > 0
            ? currentPlayerRecord.secondaryPositions.map((position) => POSITION_LABELS[position]).join(', ')
            : 'Nao informadas'}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Posicao preferida:{' '}
          {currentPlayerRecord.preferredPosition
            ? POSITION_LABELS[currentPlayerRecord.preferredPosition]
            : 'Nao informada'}
        </Text>
        {currentPlayerRecord.bio ? (
          <Text style={[styles.bio, { color: theme.colors.textMuted }]}>{currentPlayerRecord.bio}</Text>
        ) : null}
      </View>

      {aggregate ? (
        <>
          <View style={styles.metricsRow}>
            <MetricCard
              label={aggregateMetricCards[0]?.label ?? 'Jogos'}
              value={aggregateMetricCards[0]?.value ?? '0'}
              helper={aggregateMetricCards[0]?.helper}
            />
            <MetricCard
              label={aggregateMetricCards[1]?.label ?? 'Gols'}
              value={aggregateMetricCards[1]?.value ?? '0'}
              helper={aggregateMetricCards[1]?.helper}
            />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              label={aggregateMetricCards[2]?.label ?? 'Assistências'}
              value={aggregateMetricCards[2]?.value ?? '0'}
              helper={aggregateMetricCards[2]?.helper}
            />
            <MetricCard
              label={aggregateMetricCards[3]?.label ?? 'Participações em gol'}
              value={aggregateMetricCards[3]?.value ?? '0'}
              helper={aggregateMetricCards[3]?.helper}
            />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              label={aggregateMetricCards[4]?.label ?? 'Nota geral'}
              value={aggregateMetricCards[4]?.value ?? '0'}
              helper={aggregateMetricCards[4]?.helper}
            />
            <MetricCard
              label={aggregateMetricCards[5]?.label ?? 'MVPs'}
              value={aggregateMetricCards[5]?.value ?? '0'}
              helper={aggregateMetricCards[5]?.helper}
            />
          </View>
        </>
      ) : null}

      <View
        style={[
          styles.ratingsCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <SectionHeader
          title="Notas recebidas"
          subtitle="Resumo por criterio no recorte selecionado"
        />

        <View style={styles.filterGroup}>
          <View style={styles.filterRow}>
            <FilterChip label="Geral" selected={filterMode === 'all'} onPress={() => setFilterMode('all')} />
            <FilterChip label="Ano" selected={filterMode === 'year'} onPress={() => setFilterMode('year')} />
            <FilterChip label="Mes" selected={filterMode === 'month'} onPress={() => setFilterMode('month')} />
            <FilterChip
              label="Ult. 5 jogos"
              selected={filterMode === 'last-games'}
              onPress={() => setFilterMode('last-games')}
            />
          </View>
        </View>

        {filterMode === 'year' || filterMode === 'month' ? (
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Ano</Text>
            <View style={styles.filterRow}>
              {availableYears.map((year) => (
                <FilterChip
                  key={year}
                  label={String(year)}
                  selected={resolvedYear === year}
                  onPress={() => setSelectedYear(year)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {filterMode === 'month' ? (
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Mes</Text>
            <View style={styles.filterRow}>
              {availableMonths.map((month) => (
                <FilterChip
                  key={month}
                  label={MONTH_LABELS[month - 1] ?? String(month)}
                  selected={resolvedMonth === month}
                  onPress={() => setSelectedMonth(month)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {ratingSummary.totalRatings > 0 ? (
          <>
            <View style={styles.metricsRow}>
              <MetricCard
                label="Nota geral"
                value={formatStatNumber(ratingSummary.overallAverage, 1)}
                helper="nota geral"
              />
              <MetricCard
                label="Avaliações"
                value={String(ratingSummary.totalRatings)}
                helper="consideradas no filtro"
              />
            </View>

            <View style={styles.metricsRow}>
              <MetricCard
                label="Melhor critério"
                value={bestCriterion?.label ?? '-'}
                helper={
                  bestCriterion
                    ? `${formatStatNumber(bestCriterion.average, 1)} - ${
                        bestCriterion.type === 'negative' ? 'alerta controlado' : 'destaque'
                      }`
                    : 'Sem comparativo'
                }
              />
              <MetricCard
                label="A melhorar"
                value={improvementCriterion?.label ?? '-'}
                helper={
                  improvementCriterion
                    ? `${formatStatNumber(improvementCriterion.average, 1)} - ${
                        improvementCriterion.type === 'negative'
                          ? 'quanto menor, melhor'
                          : 'pode crescer'
                      }`
                    : 'Sem comparativo'
                }
              />
            </View>

            <View style={styles.metricsRow}>
              <MetricCard
                label="Evolução"
                value={
                  trend
                    ? trend.delta > 0
                      ? `+${formatStatNumber(trend.delta, 1)}`
                      : formatStatNumber(trend.delta, 1)
                    : '-'
                }
                helper={
                  trend
                    ? `ultimos jogos vs bloco anterior`
                    : 'Pouco historico para comparar'
                }
              />
              <MetricCard
                label="Último recorte"
                value={trend ? formatStatNumber(trend.recentAverage, 1) : '-'}
                helper={trend?.latestMatchLabel ? `até ${trend.latestMatchLabel}` : 'Sem data'}
              />
            </View>

            <View style={styles.criteriaGrid}>
              {criteriaEntries.map((item) => (
                <View
                  key={item.criterionId}
                  style={[
                    styles.criteriaCard,
                    {
                      backgroundColor: theme.colors.backgroundElevated,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.criteriaLabel, { color: theme.colors.text }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.criteriaValue, { color: theme.colors.text }]}>
                    {formatStatNumber(item.average, 1)}
                  </Text>
                  <Text style={[styles.criteriaMeta, { color: theme.colors.textMuted }]}>
                    {item.count} avaliacao(oes) -{' '}
                    {item.type === 'negative' ? 'quanto menor, melhor' : 'quanto maior, melhor'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            Este jogador ainda nao recebeu avaliacoes no recorte selecionado.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  ratingsCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  infoTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  bio: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  criteriaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  criteriaCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    minWidth: 150,
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
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});

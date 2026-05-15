import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  applyPlayerStatsFilters,
  buildCriterionSortMetric,
  buildPlayerMetricSubtitle,
  buildPlayerAggregates,
  buildRankingByMetric,
  calculateRankingMetric,
  filterMatchesForStats,
  formatStatNumber,
  getCriterionIdFromMetric,
  getAvailableStatsMonths,
  getAvailableStatsYears,
  isCriterionMetric,
  PLAYER_STATS_LABELS,
  formatPlayerMetricValue,
  type StatsFilters,
  type StatsPeriodPreset,
  type StatsPlayerScope,
  type StatsSortMetric,
} from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import { selectActiveTeamRatingCriteria, selectCurrentTeam } from '@/store/selectors';
import type { MatchType, TeamRatingCriterion } from '@/types/domain';

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MATCH_TYPE_FILTERS: Array<'all' | MatchType> = ['all', 'society', 'futsal', 'field', 'training'];
const PERIOD_FILTERS: Array<{ id: StatsPeriodPreset; label: string }> = [
  { id: 'all', label: 'Geral' },
  { id: 'current-year', label: 'Ano atual' },
  { id: 'year', label: 'Ano' },
  { id: 'current-month', label: 'Mes atual' },
  { id: 'month', label: 'Mes/Ano' },
];
const PLAYER_SCOPE_FILTERS: Array<{ id: StatsPlayerScope; label: string }> = [
  { id: 'active', label: 'So ativos' },
  { id: 'with-history', label: 'Incluir inativos' },
  { id: 'all', label: 'Todos' },
];
const MIN_GAMES_FILTERS = [1, 3, 5, 10];
const RANKING_METRICS: Array<{
  id: StatsSortMetric;
  label: string;
}> = [
  { id: 'goals', label: PLAYER_STATS_LABELS.goals },
  { id: 'assists', label: PLAYER_STATS_LABELS.assists },
  { id: 'goalParticipations', label: PLAYER_STATS_LABELS.goalParticipations },
  { id: 'participationsPerGame', label: PLAYER_STATS_LABELS.participationsPerGame },
  { id: 'avgRating', label: PLAYER_STATS_LABELS.avgRating },
  { id: 'mvpAwards', label: PLAYER_STATS_LABELS.mvpAwards },
  { id: 'mvpVotesReceived', label: PLAYER_STATS_LABELS.mvpVotesReceived },
  { id: 'games', label: PLAYER_STATS_LABELS.games },
];

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
      <Text style={[styles.filterText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function rankingValueLabel(
  metric: StatsSortMetric,
  value: number,
  criterion?: TeamRatingCriterion | null,
) {
  if (isCriterionMetric(metric)) {
    return criterion?.type === 'negative'
      ? `${formatStatNumber(value, 1)} adj.`
      : formatStatNumber(value, 1);
  }

  return formatPlayerMetricValue(metric, value);
}

export default function RankingsScreen() {
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const activeCriteria = useAppStore(selectActiveTeamRatingCriteria);
  const [selectedType, setSelectedType] = useState<'all' | MatchType>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriodPreset>('all');
  const [selectedPlayerScope, setSelectedPlayerScope] = useState<StatsPlayerScope>('with-history');
  const [selectedMetric, setSelectedMetric] = useState<StatsSortMetric>('goals');
  const [minGames, setMinGames] = useState(1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showFullRanking, setShowFullRanking] = useState(false);

  if (!team) {
    return null;
  }

  const finishedMatches = snapshot.matches.filter(
    (match) => match.teamId === team.id && match.status === 'finished',
  );
  const availableYears = getAvailableStatsYears(finishedMatches);
  const resolvedYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] ?? new Date().getFullYear();
  const availableMonths = getAvailableStatsMonths(finishedMatches, resolvedYear);
  const resolvedMonth = availableMonths.includes(selectedMonth)
    ? selectedMonth
    : availableMonths[0] ?? new Date().getMonth() + 1;
  const filters: StatsFilters = {
    matchType: selectedType,
    period: selectedPeriod,
    year: resolvedYear,
    month: resolvedMonth,
    playerScope: selectedPlayerScope,
    minGames,
  };
  const playerStats = applyPlayerStatsFilters(
    buildPlayerAggregates(snapshot, team.id, filters),
    { minGames },
  );
  const ranking = buildRankingByMetric(playerStats, selectedMetric, {
    limit: showFullRanking ? undefined : 5,
    minGames,
  });
  const selectedCriterionId = getCriterionIdFromMetric(selectedMetric);
  const selectedCriterion =
    activeCriteria.find((criterion) => criterion.id === selectedCriterionId) ?? null;
  const filteredMatches = filterMatchesForStats(snapshot.matches, team.id, filters);

  return (
    <Screen>
      <SectionHeader title="Rankings" subtitle="Ordene por gols, media, MVP e participacao" />

      <View
        style={[
          styles.filterPanel,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.filterTitle, { color: theme.colors.text }]}>Filtros</Text>

        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Periodo</Text>
          <View style={styles.filterRow}>
            {PERIOD_FILTERS.map((filter) => (
              <FilterChip
                key={filter.id}
                label={filter.label}
                selected={selectedPeriod === filter.id}
                onPress={() => setSelectedPeriod(filter.id)}
              />
            ))}
          </View>
        </View>

        {selectedPeriod === 'year' || selectedPeriod === 'month' ? (
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

        {selectedPeriod === 'month' ? (
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

        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Tipo de jogo</Text>
          <View style={styles.filterRow}>
            {MATCH_TYPE_FILTERS.map((filter) => (
              <FilterChip
                key={filter}
                label={filter === 'all' ? 'Todos' : MATCH_TYPE_LABELS[filter]}
                selected={selectedType === filter}
                onPress={() => setSelectedType(filter)}
              />
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Jogadores</Text>
          <View style={styles.filterRow}>
            {PLAYER_SCOPE_FILTERS.map((filter) => (
              <FilterChip
                key={filter.id}
                label={filter.label}
                selected={selectedPlayerScope === filter.id}
                onPress={() => setSelectedPlayerScope(filter.id)}
              />
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Minimo de jogos</Text>
          <View style={styles.filterRow}>
            {MIN_GAMES_FILTERS.map((value) => (
              <FilterChip
                key={value}
                label={`${value}+`}
                selected={minGames === value}
                onPress={() => setMinGames(value)}
              />
            ))}
          </View>
        </View>
      </View>

      <SectionHeader
        title="Ordenar por"
        subtitle={`${filteredMatches.length} partida(s) consideradas no filtro`}
      />
      <View style={styles.metricRow}>
        {RANKING_METRICS.map((metric) => (
          <FilterChip
            key={metric.id}
            label={metric.label}
            selected={selectedMetric === metric.id}
            onPress={() => setSelectedMetric(metric.id)}
          />
        ))}
      </View>

      {activeCriteria.length > 0 ? (
        <>
          <SectionHeader
            title="Notas do elenco"
            subtitle="Rankeie pela nota geral ou por um critério específico"
          />
          <View style={styles.metricRow}>
            <FilterChip
              label={PLAYER_STATS_LABELS.overallRating}
              selected={selectedMetric === 'avgRating'}
              onPress={() => setSelectedMetric('avgRating')}
            />
            {activeCriteria.map((criterion) => (
              <FilterChip
                key={criterion.id}
                label={criterion.label}
                selected={selectedMetric === buildCriterionSortMetric(criterion.id)}
                onPress={() => setSelectedMetric(buildCriterionSortMetric(criterion.id))}
              />
            ))}
          </View>
        </>
      ) : null}

      {ranking.length === 0 ? (
        <EmptyState
          title="Sem ranking para este recorte"
          description="Reduza o minimo de jogos ou escolha outro periodo para mostrar jogadores."
        />
      ) : (
        <>
          <RankingList
            title={showFullRanking ? 'Ranking completo' : 'Top 5'}
            items={ranking.map((item) => {
              const value = calculateRankingMetric(item, selectedMetric);
              return {
                id: item.player.id,
                label: item.player.nickname,
                subtitle: buildPlayerMetricSubtitle(selectedMetric, item),
                value,
                valueLabel: rankingValueLabel(selectedMetric, value, selectedCriterion),
              };
            })}
          />
          <AppButton
            label={showFullRanking ? 'Mostrar so top 5' : 'Ver ranking completo'}
            variant="secondary"
            onPress={() => setShowFullRanking((current) => !current)}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterPanel: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 16,
  },
  filterTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  filterGroup: {
    gap: 10,
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
    gap: 10,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});

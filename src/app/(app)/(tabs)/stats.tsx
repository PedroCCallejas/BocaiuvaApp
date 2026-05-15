import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
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
  buildPlayerProfileMetricCards,
  buildRankingByMetric,
  buildTeamAggregates,
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

type StatsTabId = 'goals' | 'assists' | 'ga' | 'average' | 'mvp' | 'games';

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
const TAB_CONFIG: Array<{
  id: StatsTabId;
  label: string;
  metric: StatsSortMetric;
}> = [
  { id: 'goals', label: PLAYER_STATS_LABELS.goals, metric: 'goals' },
  { id: 'assists', label: PLAYER_STATS_LABELS.assists, metric: 'assists' },
  { id: 'ga', label: PLAYER_STATS_LABELS.goalParticipations, metric: 'goalParticipations' },
  { id: 'average', label: PLAYER_STATS_LABELS.avgRating, metric: 'avgRating' },
  { id: 'mvp', label: PLAYER_STATS_LABELS.mvpAwards, metric: 'mvpAwards' },
  { id: 'games', label: PLAYER_STATS_LABELS.games, metric: 'games' },
];

function valueLabelForMetric(
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
          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}>
      <Text style={[styles.filterText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function StatsScreen() {
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const activeCriteria = useAppStore(selectActiveTeamRatingCriteria);
  const [selectedType, setSelectedType] = useState<'all' | MatchType>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriodPreset>('all');
  const [selectedPlayerScope, setSelectedPlayerScope] = useState<StatsPlayerScope>('with-history');
  const [minGames, setMinGames] = useState(1);
  const [selectedTab, setSelectedTab] = useState<StatsTabId>('ga');
  const [selectedRatingMetric, setSelectedRatingMetric] = useState<StatsSortMetric>('avgRating');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

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
  const teamStats = buildTeamAggregates(snapshot, team.id, filters);
  const playerStats = applyPlayerStatsFilters(
    buildPlayerAggregates(snapshot, team.id, filters),
    { minGames },
  );
  const selectedMetric = TAB_CONFIG.find((tab) => tab.id === selectedTab)?.metric ?? 'goalParticipations';
  const topRanking = buildRankingByMetric(playerStats, selectedMetric, {
    limit: 5,
    minGames,
  });
  const byGoals = buildRankingByMetric(playerStats, 'goals', { limit: 1, minGames });
  const byAssists = buildRankingByMetric(playerStats, 'assists', { limit: 1, minGames });
  const byMvp = buildRankingByMetric(playerStats, 'mvpAwards', { limit: 1, minGames });
  const byRating = buildRankingByMetric(playerStats, 'avgRating', { limit: 1, minGames });
  const bySelectedRatingMetric = buildRankingByMetric(playerStats, selectedRatingMetric, {
    limit: 5,
    minGames,
  });
  const selectedCriterionId = getCriterionIdFromMetric(selectedRatingMetric);
  const selectedCriterion =
    activeCriteria.find((criterion) => criterion.id === selectedCriterionId) ?? null;
  const filteredMatches = filterMatchesForStats(snapshot.matches, team.id, filters);
  const hasFinishedMatches = teamStats.totalMatches > 0 || playerStats.some((item) => item.hasHistory);
  const bestRatedPlayerCards = byRating[0] ? buildPlayerProfileMetricCards(byRating[0]) : [];

  return (
    <Screen>
      <SectionHeader title="Estatisticas" subtitle="Leitura automatica dos jogos encerrados" />

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

      <View style={styles.metricsRow}>
        <MetricCard label="Jogos" value={String(teamStats.totalMatches)} helper="encerrados" />
        <MetricCard label="Vitorias" value={String(teamStats.wins)} helper={`${teamStats.pointsRate}%`} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard label="Gols feitos" value={String(teamStats.goalsFor)} helper={`Media ${formatStatNumber(teamStats.goalsPerGame, 2)}`} />
        <MetricCard label="Gols tomados" value={String(teamStats.goalsAgainst)} helper={`Saldo ${teamStats.goalDiff}`} />
      </View>

      <View style={styles.metricsRow}>
        <MetricCard
          label="Artilheiro"
          value={byGoals[0]?.player.nickname ?? '-'}
          helper={byGoals[0] ? `${byGoals[0].goals} gol(s)` : 'Sem lideranca ainda'}
        />
        <MetricCard
          label={`Melhor ${PLAYER_STATS_LABELS.overallRating.toLowerCase()}`}
          value={byRating[0]?.player.nickname ?? '-'}
          helper={
            bestRatedPlayerCards[4]
              ? `${bestRatedPlayerCards[4].value} ${PLAYER_STATS_LABELS.overallRating.toLowerCase()}`
              : 'Sem notas ainda'
          }
        />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard
          label={PLAYER_STATS_LABELS.assists}
          value={byAssists[0]?.player.nickname ?? '-'}
          helper={
            byAssists[0]
              ? `${formatPlayerMetricValue('assists', byAssists[0].assists)} ${PLAYER_STATS_LABELS.assists.toLowerCase()}`
              : 'Sem liderança ainda'
          }
        />
        <MetricCard
          label={PLAYER_STATS_LABELS.mvpAwards}
          value={byMvp[0]?.player.nickname ?? '-'}
          helper={
            byMvp[0]
              ? `${formatPlayerMetricValue('mvpAwards', byMvp[0].mvpAwards)} ${PLAYER_STATS_LABELS.mvpAwards}`
              : 'Sem MVP ainda'
          }
        />
      </View>

      {!hasFinishedMatches ? (
        <EmptyState
          title="Sem estatisticas por enquanto"
          description="As estatisticas aparecem assim que as primeiras partidas forem encerradas."
        />
      ) : (
        <>
          <SectionHeader
            title="Top 5 do recorte"
            subtitle={`${filteredMatches.length} partida(s) no filtro atual`}
          />
          <View style={styles.tabRow}>
            {TAB_CONFIG.map((tab) => (
              <FilterChip
                key={tab.id}
                label={tab.label}
                selected={selectedTab === tab.id}
                onPress={() => setSelectedTab(tab.id)}
              />
            ))}
          </View>

          {topRanking.length > 0 ? (
            <RankingList
              title="Destaques"
              items={topRanking.map((item) => ({
                id: item.player.id,
                label: item.player.nickname,
                subtitle: buildPlayerMetricSubtitle(selectedMetric, item),
                value: calculateRankingMetric(item, selectedMetric),
                valueLabel: valueLabelForMetric(
                  selectedMetric,
                  calculateRankingMetric(item, selectedMetric),
                ),
              }))}
            />
          ) : (
            <EmptyState
              title="Nenhum jogador atende ao filtro"
              description="Reduza o minimo de jogos ou troque o periodo para exibir destaques."
            />
          )}

          <AppButton
            label="Ver ranking completo"
            variant="secondary"
            onPress={() => router.push('/rankings')}
          />

          {activeCriteria.length > 0 ? (
            <>
              <SectionHeader
                title="Notas por critério"
                subtitle="Leia a nota geral ou o melhor desempenho em um critério específico"
              />
              <View style={styles.tabRow}>
                <FilterChip
                  label={PLAYER_STATS_LABELS.overallRating}
                  selected={selectedRatingMetric === 'avgRating'}
                  onPress={() => setSelectedRatingMetric('avgRating')}
                />
                {activeCriteria.map((criterion) => (
                  <FilterChip
                    key={criterion.id}
                    label={criterion.label}
                    selected={selectedRatingMetric === buildCriterionSortMetric(criterion.id)}
                    onPress={() => setSelectedRatingMetric(buildCriterionSortMetric(criterion.id))}
                  />
                ))}
              </View>

              {bySelectedRatingMetric.length > 0 ? (
                <RankingList
                  title="Destaques por nota"
                  items={bySelectedRatingMetric.map((item) => ({
                    id: item.player.id,
                    label: item.player.nickname,
                    subtitle: buildPlayerMetricSubtitle(selectedRatingMetric, item),
                    value: calculateRankingMetric(item, selectedRatingMetric),
                    valueLabel: valueLabelForMetric(
                      selectedRatingMetric,
                      calculateRankingMetric(item, selectedRatingMetric),
                      selectedCriterion,
                    ),
                  }))}
                />
              ) : null}
            </>
          ) : null}
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
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MetricCard } from '@/components/cards/MetricCard';
import { PlayerCard } from '@/components/cards/PlayerCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildPlayerAggregates, buildTeamAggregates } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam } from '@/store/selectors';
import type { MatchType } from '@/types/domain';

const filters: Array<'all' | MatchType> = ['all', 'society', 'training'];

export default function StatsScreen() {
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const [selectedType, setSelectedType] = useState<'all' | MatchType>('all');

  if (!team) {
    return null;
  }

  const teamStats = buildTeamAggregates(snapshot, team.id, { matchType: selectedType });
  const playerStats = buildPlayerAggregates(snapshot, team.id, { matchType: selectedType })
    .sort((left, right) => right.goalParticipations - left.goalParticipations)
    .slice(0, 5);
  const hasFinishedMatches = teamStats.totalMatches > 0;

  return (
    <Screen>
      <SectionHeader title="Estatisticas" subtitle="Leitura automatica dos jogos encerrados" />
      <View style={styles.filterRow}>
        {filters.map((filter) => {
          const selected = selectedType === filter;
          return (
            <Pressable
              key={filter}
              onPress={() => setSelectedType(filter)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                },
              ]}>
              <Text style={[styles.filterText, { color: theme.colors.text }]}>
                {filter === 'all' ? 'Todos' : MATCH_TYPE_LABELS[filter]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.metricsRow}>
        <MetricCard label="Jogos" value={String(teamStats.totalMatches)} helper="encerrados" />
        <MetricCard label="Vitorias" value={String(teamStats.wins)} helper={`${teamStats.pointsRate}%`} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard label="Gols pro" value={String(teamStats.goalsFor)} helper={`Media ${teamStats.goalsPerGame}`} />
        <MetricCard label="Gols contra" value={String(teamStats.goalsAgainst)} helper={`Saldo ${teamStats.goalDiff}`} />
      </View>

      {!hasFinishedMatches ? (
        <EmptyState
          title="Sem estatisticas por enquanto"
          description="As estatisticas aparecem assim que as primeiras partidas forem encerradas."
        />
      ) : (
        <>
          <SectionHeader title="Top participacoes em gol" subtitle="Recorte atual do filtro" />
          {playerStats.map((item) => (
            <PlayerCard
              key={item.player.id}
              player={item.player}
              statsLabel={`${item.games} jogos - ${item.goals} gols - ${item.assists} assistencias - nota ${item.avgRating || 0}`}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

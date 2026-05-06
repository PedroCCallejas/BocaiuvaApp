import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { RankingList } from '@/components/stats/RankingList';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildPlayerAggregates } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam } from '@/store/selectors';
import type { MatchType } from '@/types/domain';

const filters: Array<'all' | MatchType> = ['all', 'society', 'training'];

export default function RankingsScreen() {
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const [selectedType, setSelectedType] = useState<'all' | MatchType>('all');

  if (!team) {
    return null;
  }

  const stats = buildPlayerAggregates(snapshot, team.id, { matchType: selectedType });
  const topScorers = [...stats]
    .sort((left, right) => right.goals - left.goals)
    .slice(0, 5)
    .map((item) => ({
      id: item.player.id,
      label: item.player.nickname,
      subtitle: `${item.goalParticipations} participacoes em gol`,
      value: item.goals,
    }));
  const topMvps = [...stats]
    .sort((left, right) => right.mvps - left.mvps)
    .slice(0, 5)
    .map((item) => ({
      id: item.player.id,
      label: item.player.nickname,
      subtitle: `${item.games} jogos`,
      value: item.mvps,
    }));
  const topAssists = [...stats]
    .sort((left, right) => right.assists - left.assists)
    .slice(0, 5)
    .map((item) => ({
      id: item.player.id,
      label: item.player.nickname,
      subtitle: `${item.goalParticipations} participacoes em gol`,
      value: item.assists,
    }));

  return (
    <Screen>
      <SectionHeader title="Rankings" subtitle="Leitura rapida de artilharia, MVP e nota media" />
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
                  backgroundColor: selected ? theme.colors.secondarySoft : theme.colors.surface,
                  borderColor: selected ? theme.colors.secondary : theme.colors.border,
                },
              ]}>
              <Text style={[styles.filterText, { color: theme.colors.text }]}>
                {filter === 'all' ? 'Todos' : MATCH_TYPE_LABELS[filter]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {topScorers.length === 0 && topMvps.length === 0 && topAssists.length === 0 ? (
        <EmptyState
          title="Sem rankings por enquanto"
          description="Assim que as partidas forem encerradas, os destaques do time aparecem aqui."
        />
      ) : (
        <>
          <RankingList title="Artilharia" items={topScorers} />
          <RankingList title="Assistencias" items={topAssists} />
          <RankingList title="MVPs" items={topMvps} />
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
});

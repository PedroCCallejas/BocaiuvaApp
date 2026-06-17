import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { PlayerCard } from '@/components/cards/PlayerCard';
import { SyncStatusCard } from '@/components/cards/SyncStatusCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildTeamPlayerAchievementMap, getTopPlayerAchievements } from '@/lib/player-achievements';
import { buildPlayerAggregates, buildPlayerStatsLabel } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManagePlayers,
  selectCurrentTeam,
  selectIsRefreshingData,
  selectSyncStatusHint,
  selectSyncStatusMessage,
  selectTeamHistoricalPlayers,
} from '@/store/selectors';

type PlayerRosterFilter = 'active' | 'inactive' | 'all';

const PLAYER_FILTER_LABELS: Record<PlayerRosterFilter, string> = {
  active: 'Ativos',
  inactive: 'Inativos',
  all: 'Todos',
};

export default function PlayersScreen() {
  const isWeb = Platform.OS === 'web';
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const players = useAppStore(selectTeamHistoricalPlayers);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const refreshData = useAppStore((state) => state.refreshData);
  const refreshing = useAppStore(selectIsRefreshingData);
  const syncMessage = useAppStore(selectSyncStatusMessage);
  const syncHint = useAppStore(selectSyncStatusHint);
  const [rosterFilter, setRosterFilter] = useState<PlayerRosterFilter>('active');

  const stats = useMemo(
    () => team ? buildPlayerAggregates(snapshot, team.id, { playerScope: 'all' }) : [],
    [snapshot, team],
  );
  const statsByPlayerId = useMemo(
    () => new Map(stats.map((entry) => [entry.player.id, entry])),
    [stats],
  );
  const achievementMap = useMemo(
    () =>
      buildTeamPlayerAchievementMap({
        players,
        matches: snapshot.matches,
        attendance: snapshot.attendance,
        matchStats: snapshot.matchStats,
        mvpVotes: snapshot.mvpVotes,
        ratings: snapshot.playerRatings,
        ratingCriteria: snapshot.ratingCriteria,
      }),
    [
      players,
      snapshot.attendance,
      snapshot.matchStats,
      snapshot.matches,
      snapshot.mvpVotes,
      snapshot.playerRatings,
      snapshot.ratingCriteria,
    ],
  );
  const activePlayers = players.filter((player) => player.status === 'active' && !player.deletedAt);
  const inactivePlayers = players.filter((player) => player.status !== 'active' || Boolean(player.deletedAt));
  const visiblePlayers = useMemo(() => {
    if (!canManagePlayers) {
      return activePlayers;
    }

    switch (rosterFilter) {
      case 'inactive':
        return inactivePlayers;
      case 'all':
        return players;
      case 'active':
      default:
        return activePlayers;
    }
  }, [activePlayers, canManagePlayers, inactivePlayers, players, rosterFilter]);

  if (!team) {
    return null;
  }

  return (
    <Screen onRefresh={() => void refreshData()} refreshing={refreshing}>
      {!isWeb ? (
        <SectionHeader
          title="Elenco"
          subtitle={
            visiblePlayers.length > 0
              ? `${visiblePlayers.length} jogador(es) em ${PLAYER_FILTER_LABELS[canManagePlayers ? rosterFilter : 'active'].toLowerCase()}`
              : `Monte o elenco de ${team.name}`
          }
          actionLabel={canManagePlayers ? 'Adicionar jogador' : undefined}
          onAction={canManagePlayers ? () => router.push('/players/create') : undefined}
        />
      ) : null}
      <SyncStatusCard
        hint={syncHint}
        loading={refreshing}
        message={syncMessage}
        onRefresh={() => void refreshData()}
      />

      {canManagePlayers ? (
        <>
          <View style={styles.filterRow}>
            {(['active', 'inactive', 'all'] as PlayerRosterFilter[]).map((filter) => {
              const selected = rosterFilter === filter;
              const total =
                filter === 'active'
                  ? activePlayers.length
                  : filter === 'inactive'
                    ? inactivePlayers.length
                    : players.length;

              return (
                <Pressable
                  key={filter}
                  onPress={() => setRosterFilter(filter)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selected
                        ? theme.colors.primarySoft
                        : theme.colors.backgroundElevated,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.filterText, { color: theme.colors.text }]}>
                    {PLAYER_FILTER_LABELS[filter]} ({total})
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!isWeb ? (
            <AppButton label="Adicionar jogador" onPress={() => router.push('/players/create')} />
          ) : null}
        </>
      ) : null}

      {visiblePlayers.length === 0 ? (
        <EmptyState
          title={
            players.length === 0
              ? 'Nenhum jogador cadastrado ainda'
              : rosterFilter === 'inactive'
                ? 'Nenhum jogador inativo'
                : 'Nenhum jogador encontrado neste filtro'
          }
          description={
            players.length === 0
              ? canManagePlayers
                ? 'Convide seus jogadores para comecar ou cadastre o primeiro nome do elenco.'
                : 'O administrador ainda não cadastrou jogadores neste time.'
              : rosterFilter === 'inactive'
                ? 'Quando alguem sair do elenco ativo, o cadastro continua aparecendo aqui para reativacao.'
                : 'Troque o filtro para visualizar outra parte do elenco.'
          }
          actionLabel={
            players.length === 0 && canManagePlayers ? 'Convidar jogadores' : undefined
          }
          onAction={
            players.length === 0 && canManagePlayers
              ? () => router.push('/team-invite' as never)
              : undefined
          }
        />
      ) : null}

      {visiblePlayers.map((player) => {
        const item = statsByPlayerId.get(player.id);
        const label = item ? buildPlayerStatsLabel(item) : undefined;
        const achievements = getTopPlayerAchievements(achievementMap.get(player.id) ?? [], 3);

        return (
          <PlayerCard
            key={player.id}
            player={player}
            statsLabel={label}
            achievements={achievements}
            onPress={() => router.push(`/players/${player.id}`)}
          />
        );
      })}
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

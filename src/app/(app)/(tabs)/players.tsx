import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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

type PlayerRosterFilter = 'active' | 'injured' | 'inactive' | 'suspended' | 'all';

const PLAYER_FILTER_LABELS: Record<PlayerRosterFilter, string> = {
  active: 'Ativos',
  injured: 'Lesionados',
  inactive: 'Inativos',
  suspended: 'Antigos',
  all: 'Todos',
};

// Busca tolerante a acento e caixa: "jose" encontra "José".
function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

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
  const [searchQuery, setSearchQuery] = useState('');

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
  const injuredPlayers = players.filter((player) => player.status === 'injured' && !player.deletedAt);
  const inactivePlayers = players.filter((player) => player.status === 'inactive' || Boolean(player.deletedAt));
  const suspendedPlayers = players.filter((player) => player.status === 'suspended' && !player.deletedAt);
  const playersInFilter = useMemo(() => {
    if (!canManagePlayers) {
      return activePlayers;
    }

    switch (rosterFilter) {
      case 'injured':
        return injuredPlayers;
      case 'inactive':
        return inactivePlayers;
      case 'suspended':
        return suspendedPlayers;
      case 'all':
        return players;
      case 'active':
      default:
        return activePlayers;
    }
  }, [activePlayers, injuredPlayers, inactivePlayers, suspendedPlayers, canManagePlayers, players, rosterFilter]);

  const normalizedQuery = normalizeSearchText(searchQuery);
  const isSearching = normalizedQuery.length > 0;

  const visiblePlayers = useMemo(() => {
    if (!normalizedQuery) {
      return playersInFilter;
    }

    return playersInFilter.filter((player) => {
      const haystack = normalizeSearchText(
        `${player.nickname} ${player.fullName} ${player.jerseyNumber} ${player.primaryPosition}`,
      );

      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, playersInFilter]);

  if (!team) {
    return null;
  }

  return (
    <Screen onRefresh={() => void refreshData()} refreshing={refreshing}>
      {!isWeb ? (
        <SectionHeader
          title="Elenco"
          subtitle={
            isSearching
              ? `${visiblePlayers.length} resultado(s) para "${searchQuery.trim()}"`
              : visiblePlayers.length > 0
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

      <View
        style={[
          styles.searchField,
          {
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: theme.colors.borderStrong,
          },
        ]}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por nome, apelido ou número"
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.action}
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.colors.text }]}
        />
        {isSearching ? (
          <Pressable
            onPress={() => setSearchQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Limpar busca">
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {canManagePlayers ? (
        <>
          <View style={styles.filterRow}>
            {(['active', 'injured', 'inactive', 'suspended', 'all'] as PlayerRosterFilter[]).map((filter) => {
              const selected = rosterFilter === filter;
              const total =
                filter === 'active'
                  ? activePlayers.length
                  : filter === 'injured'
                    ? injuredPlayers.length
                    : filter === 'inactive'
                      ? inactivePlayers.length
                      : filter === 'suspended'
                        ? suspendedPlayers.length
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

      {visiblePlayers.length === 0 && isSearching ? (
        <EmptyState
          title="Nenhum jogador encontrado"
          description={`Nada corresponde a "${searchQuery.trim()}" neste filtro. Tente outro termo ou troque o filtro.`}
          actionLabel="Limpar busca"
          onAction={() => setSearchQuery('')}
        />
      ) : null}

      {visiblePlayers.length === 0 && !isSearching ? (
        <EmptyState
          title={
            players.length === 0
              ? 'Nenhum jogador cadastrado ainda'
              : rosterFilter === 'injured'
                ? 'Nenhum jogador lesionado'
                : rosterFilter === 'inactive'
                  ? 'Nenhum jogador inativo'
                  : rosterFilter === 'suspended'
                    ? 'Nenhum jogador antigo'
                    : 'Nenhum jogador encontrado neste filtro'
          }
          description={
            players.length === 0
              ? canManagePlayers
                ? 'Convide seus jogadores para comecar ou cadastre o primeiro nome do elenco.'
                : 'O administrador ainda não cadastrou jogadores neste time.'
              : rosterFilter === 'injured'
                ? 'Jogadores em recuperação aparecem aqui. Quando voltarem, use "Reativar" na ficha.'
                : rosterFilter === 'inactive'
                  ? 'Quando alguem sair do elenco ativo, o cadastro continua aparecendo aqui para reativacao.'
                  : rosterFilter === 'suspended'
                    ? 'Jogadores fora do elenco permanentemente aparecem aqui como "Antigos".'
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
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
  },
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

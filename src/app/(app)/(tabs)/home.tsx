import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { MatchCard } from '@/components/cards/MatchCard';
import { MetricCard } from '@/components/cards/MetricCard';
import { NotificationCard } from '@/components/cards/NotificationCard';
import { SyncStatusCard } from '@/components/cards/SyncStatusCard';
import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
import { PresentationVideoCard } from '@/components/video/PresentationVideoCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RankingList } from '@/components/stats/RankingList';
import { buildPlayerAggregates, buildTeamAggregates } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManagePlayers,
  getAttendanceSummary,
  selectCanManageTeam,
  selectCurrentUser,
  selectCurrentTeam,
  selectIsRefreshingData,
  selectSyncStatusHint,
  selectSyncStatusMessage,
  selectTeamNotifications,
  selectTeamPlayers,
  selectUnreadNotifications,
  selectUnreadNotificationsCount,
  selectUpcomingMatches,
} from '@/store/selectors';
import type { AppNotification } from '@/types/domain';

export default function HomeScreen() {
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const currentUser = useAppStore(selectCurrentUser);
  const players = useAppStore(selectTeamPlayers);
  const upcomingMatches = useAppStore(selectUpcomingMatches);
  const notifications = useAppStore(selectTeamNotifications);
  const unreadNotifications = useAppStore(selectUnreadNotifications);
  const unreadNotificationsCount = useAppStore(selectUnreadNotificationsCount);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const refreshData = useAppStore((state) => state.refreshData);
  const markNotificationAsRead = useAppStore((state) => state.markNotificationAsRead);
  const refreshing = useAppStore(selectIsRefreshingData);
  const syncMessage = useAppStore(selectSyncStatusMessage);
  const syncHint = useAppStore(selectSyncStatusHint);
  const canCreateMatches = canManageTeam;
  const unreadIds = useMemo(
    () => new Set(unreadNotifications.map((notification) => notification.id)),
    [unreadNotifications],
  );

  if (!team || !currentUser) {
    return null;
  }

  const teamStats = buildTeamAggregates(snapshot, team.id);
  const playerStats = buildPlayerAggregates(snapshot, team.id);
  const nextMatch = upcomingMatches.find((match) => match.status !== 'canceled');
  const topScorers = [...playerStats]
    .filter((item) => item.games > 0 || item.goals > 0 || item.assists > 0)
    .sort((left, right) => right.goals - left.goals)
    .slice(0, 3)
    .map((item) => ({
      id: item.player.id,
      label: item.player.nickname,
      subtitle: `${item.goalParticipations} participações em gol`,
      value: item.goals,
    }));
  const previewNotifications = notifications.slice(0, 3);

  async function handleOpenNotification(notification: AppNotification) {
    try {
      if (unreadIds.has(notification.id)) {
        await markNotificationAsRead(notification.id);
      }

      if (notification.matchId) {
        router.push(`/matches/${notification.matchId}`);
        return;
      }

      router.push('/notifications' as never);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a notificação',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen onRefresh={() => void refreshData()} refreshing={refreshing}>
      <TeamHeroCard
        team={team}
        modeLabel={canManageTeam ? 'Comando do time' : 'Vestiário do elenco'}
      />

      {team.presentationVideoUrl ? (
        <PresentationVideoCard
          title="Apresentação do time"
          description="Um vídeo curto para dar o tom da identidade do elenco antes da rodada."
          videoUrl={team.presentationVideoUrl}
          posterUrl={team.bannerUrl ?? team.logoUrl ?? null}
          accentColors={[team.primaryColor, team.secondaryColor]}
        />
      ) : null}

      <SyncStatusCard
        hint={syncHint}
        loading={refreshing}
        message={syncMessage}
        onRefresh={() => void refreshData()}
      />

      <View style={styles.metricsRow}>
        <MetricCard label="Jogos" value={String(teamStats.totalMatches)} helper="encerrados" />
        <MetricCard
          label="Vitórias"
          value={String(teamStats.wins)}
          helper={`${teamStats.pointsRate}%`}
        />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard
          label="Gols pró"
          value={String(teamStats.goalsFor)}
          helper={`Média ${teamStats.goalsPerGame}`}
        />
        <MetricCard label="Saldo" value={String(teamStats.goalDiff)} helper="temporada" />
      </View>

      <View style={styles.actionRow}>
        <AppButton label="Ver elenco" variant="secondary" onPress={() => router.push('/players')} />
        {canManageTeam || canManagePlayers ? (
          <>
            {canManagePlayers ? (
              <AppButton label="Adicionar jogador" onPress={() => router.push('/players/create')} />
            ) : null}
            {canManageTeam ? (
              <AppButton
                label="Editar time"
                variant="secondary"
                onPress={() => router.push('/team-settings' as never)}
              />
            ) : null}
            {canManageTeam ? (
              <AppButton
                label="Convidar jogadores"
                variant="secondary"
                onPress={() => router.push('/team-invite' as never)}
              />
            ) : null}
          </>
        ) : null}
      </View>

      {nextMatch ? (
        <>
          <SectionHeader
            title="Próxima partida"
            subtitle="O que o elenco precisa responder agora"
            actionLabel="Ver jogos"
            onAction={() => router.push('/matches')}
          />
          <MatchCard
            match={nextMatch}
            attendance={getAttendanceSummary({ snapshot }, nextMatch.id)}
            onPress={() => router.push(`/matches/${nextMatch.id}`)}
          />
        </>
      ) : (
        <EmptyState
          title="Sem jogos futuros"
          description={
            canCreateMatches
              ? 'Crie a próxima partida para abrir confirmação de presença e escalação.'
              : 'Essa função estará disponível em breve.'
          }
          actionLabel={canCreateMatches ? 'Criar partida' : undefined}
          onAction={canCreateMatches ? () => router.push('/matches/create') : undefined}
        />
      )}

      <SectionHeader
        title="Notificações do time"
        subtitle={
          unreadNotificationsCount > 0
            ? `${unreadNotificationsCount} novidade(s) para acompanhar`
            : 'Tudo em dia com o elenco'
        }
        actionLabel="Ver todas"
        onAction={() => router.push('/notifications' as never)}
      />
      {previewNotifications.length === 0 ? (
        <EmptyState
          title="Nada novo por enquanto"
          description="As movimentações do time vão aparecer aqui assim que acontecerem."
        />
      ) : (
        previewNotifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            unread={unreadIds.has(notification.id)}
            onPress={() => void handleOpenNotification(notification)}
          />
        ))
      )}

      {players.length === 0 ? (
        <EmptyState
          title="Nenhum jogador cadastrado ainda"
          description={
            canManageTeam || canManagePlayers
              ? 'Adicione o primeiro nome do elenco ou convide seus jogadores para começar.'
              : 'O administrador ainda está montando o elenco do time.'
          }
          actionLabel={canManageTeam ? 'Convidar jogadores' : undefined}
          onAction={canManageTeam ? () => router.push('/team-invite' as never) : undefined}
        />
      ) : topScorers.length === 0 ? (
        <EmptyState
          title="Os destaques vão aparecer aqui"
          description="Assim que as primeiras partidas forem encerradas, a artilharia da temporada ganha vida."
        />
      ) : (
        <RankingList title="Artilharia da temporada" items={topScorers} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

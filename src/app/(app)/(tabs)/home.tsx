import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { MatchCard } from '@/components/cards/MatchCard';
import { MetricCard } from '@/components/cards/MetricCard';
import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
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
  selectCurrentTeam,
  selectTeamPlayers,
  selectUpcomingMatches,
} from '@/store/selectors';

export default function HomeScreen() {
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const players = useAppStore(selectTeamPlayers);
  const upcomingMatches = useAppStore(selectUpcomingMatches);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const canCreateMatches = canManageTeam;

  if (!team) {
    return null;
  }

  const teamStats = buildTeamAggregates(snapshot, team.id);
  const playerStats = buildPlayerAggregates(snapshot, team.id);
  const nextMatch = upcomingMatches.find((match) => match.status !== 'canceled');
  const topScorers = [...playerStats]
    .sort((left, right) => right.goals - left.goals)
    .slice(0, 3)
    .map((item) => ({
      id: item.player.id,
      label: item.player.nickname,
      subtitle: `${item.goalParticipations} participacoes em gol`,
      value: item.goals,
    }));

  return (
    <Screen>
      <TeamHeroCard
        team={team}
        modeLabel={canManageTeam ? 'Perfil administrador' : 'Perfil jogador'}
      />

      <View style={styles.metricsRow}>
        <MetricCard label="Jogos" value={String(teamStats.totalMatches)} helper="encerrados" />
        <MetricCard label="Vitorias" value={String(teamStats.wins)} helper={`${teamStats.pointsRate}%`} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard label="Gols pro" value={String(teamStats.goalsFor)} helper={`Media ${teamStats.goalsPerGame}`} />
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
            title="Proxima partida"
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
              ? 'Crie a proxima partida para abrir confirmacao de presenca e escalacao.'
              : 'Essa funcao estara disponivel em breve.'
          }
          actionLabel={canCreateMatches ? 'Criar partida' : undefined}
          onAction={canCreateMatches ? () => router.push('/matches/create') : undefined}
        />
      )}

      {players.length === 0 ? (
        <EmptyState
          title="Nenhum jogador cadastrado ainda"
          description={
            canManageTeam || canManagePlayers
              ? 'Adicione o primeiro nome do elenco ou convide seus jogadores para comecar.'
              : 'O administrador ainda esta montando o elenco do time.'
          }
          actionLabel={canManageTeam ? 'Convidar jogadores' : undefined}
          onAction={canManageTeam ? () => router.push('/team-invite' as never) : undefined}
        />
      ) : topScorers.length === 0 ? (
        <EmptyState
          title="Os destaques vao aparecer aqui"
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

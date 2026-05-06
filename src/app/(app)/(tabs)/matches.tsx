import { router } from 'expo-router';

import { MatchCard } from '@/components/cards/MatchCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useAppStore } from '@/store/app-store';
import {
  getAttendanceSummary,
  selectCanManageTeam,
  selectFinishedMatches,
  selectUpcomingMatches,
} from '@/store/selectors';

export default function MatchesScreen() {
  const snapshot = useAppStore((state) => state.snapshot);
  const upcomingMatches = useAppStore(selectUpcomingMatches);
  const finishedMatches = useAppStore(selectFinishedMatches);
  const canManage = useAppStore(selectCanManageTeam);
  const canCreateMatches = canManage;

  return (
    <Screen>
      <SectionHeader
        title="Partidas"
        subtitle="Agenda, presenca e historico do time"
        actionLabel={canCreateMatches ? 'Nova partida' : undefined}
        onAction={canCreateMatches ? () => router.push('/matches/create') : undefined}
      />

      {canCreateMatches ? (
        <AppButton label="Criar nova partida" onPress={() => router.push('/matches/create')} />
      ) : null}

      <SectionHeader title="Proximas" subtitle={`${upcomingMatches.length} partida(s)`} />
      {upcomingMatches.length === 0 ? (
        <EmptyState
          title="Nenhuma partida agendada"
          description={
            canCreateMatches
              ? 'Crie a primeira partida para abrir presenca e escalacao.'
              : 'As proximas partidas do time vao aparecer aqui.'
          }
          actionLabel={canCreateMatches ? 'Criar partida' : undefined}
          onAction={canCreateMatches ? () => router.push('/matches/create') : undefined}
        />
      ) : null}
      {upcomingMatches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          attendance={getAttendanceSummary({ snapshot }, match.id)}
          onPress={() => router.push(`/matches/${match.id}`)}
        />
      ))}

      <SectionHeader title="Encerradas" subtitle={`${finishedMatches.length} partida(s)`} />
      {finishedMatches.length === 0 ? (
        <EmptyState
          title="Sem historico por enquanto"
          description="Quando as partidas forem encerradas, o resumo aparece aqui."
        />
      ) : null}
      {finishedMatches
        .slice()
        .reverse()
        .map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            attendance={getAttendanceSummary({ snapshot }, match.id)}
            onPress={() => router.push(`/matches/${match.id}`)}
          />
        ))}
    </Screen>
  );
}

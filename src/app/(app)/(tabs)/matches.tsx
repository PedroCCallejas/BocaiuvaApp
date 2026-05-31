import { router } from 'expo-router';
import { Platform } from 'react-native';

import { SyncStatusCard } from '@/components/cards/SyncStatusCard';
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
  selectIsRefreshingData,
  selectOpenMatches,
  selectOverdueMatches,
  selectSyncStatusHint,
  selectSyncStatusMessage,
} from '@/store/selectors';

export default function MatchesScreen() {
  const isWeb = Platform.OS === 'web';
  const snapshot = useAppStore((state) => state.snapshot);
  const openMatches = useAppStore(selectOpenMatches);
  const overdueMatches = useAppStore(selectOverdueMatches);
  const finishedMatches = useAppStore(selectFinishedMatches);
  const canManage = useAppStore(selectCanManageTeam);
  const refreshData = useAppStore((state) => state.refreshData);
  const refreshing = useAppStore(selectIsRefreshingData);
  const syncMessage = useAppStore(selectSyncStatusMessage);
  const syncHint = useAppStore(selectSyncStatusHint);
  const canCreateMatches = canManage;

  return (
    <Screen onRefresh={() => void refreshData()} refreshing={refreshing}>
      {!isWeb ? (
        <SectionHeader
          title="Partidas"
          subtitle="Agenda, presença e histórico do time"
          actionLabel={canCreateMatches ? 'Nova partida' : undefined}
          onAction={canCreateMatches ? () => router.push('/matches/create') : undefined}
        />
      ) : null}

      <SyncStatusCard
        hint={syncHint}
        loading={refreshing}
        message={syncMessage}
        onRefresh={() => void refreshData()}
      />

      {canCreateMatches ? (
        <>
          <AppButton label="Criar nova partida" onPress={() => router.push('/matches/create')} />
          <AppButton
            label="Registrar jogo antigo"
            variant="secondary"
            onPress={() => router.push('/matches/register-legacy')}
          />
          <AppButton
            label="Importar jogos antigos"
            variant="ghost"
            onPress={() => router.push('/matches/import')}
          />
        </>
      ) : null}

      <SectionHeader
        title="Em aberto"
        subtitle={
          overdueMatches.length > 0
            ? `${openMatches.length} partida(s) - ${overdueMatches.length} pendente(s) de encerramento`
            : `${openMatches.length} partida(s)`
        }
      />
      {openMatches.length === 0 ? (
        <EmptyState
          title="Nenhuma partida agendada"
          description={
            canCreateMatches
              ? 'Crie a primeira partida para abrir presença e escalação.'
              : 'As próximas partidas do time vão aparecer aqui.'
          }
          actionLabel={canCreateMatches ? 'Criar partida' : undefined}
          onAction={canCreateMatches ? () => router.push('/matches/create') : undefined}
        />
      ) : null}
      {openMatches.map((match) => (
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
          title="Sem histórico por enquanto"
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

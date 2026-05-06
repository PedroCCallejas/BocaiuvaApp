import { router } from 'expo-router';

import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { PlayerCard } from '@/components/cards/PlayerCard';
import { buildPlayerAggregates } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManagePlayers,
  selectCurrentPlayer,
  selectCurrentTeam,
  selectTeamPlayers,
} from '@/store/selectors';

export default function PlayersScreen() {
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const players = useAppStore(selectTeamPlayers);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const currentPlayer = useAppStore(selectCurrentPlayer);

  if (!team) {
    return null;
  }

  const stats = buildPlayerAggregates(snapshot, team.id);

  return (
    <Screen>
      <SectionHeader
        title="Elenco"
        subtitle={
          players.length > 0
            ? `${players.length} jogadores cadastrados para ${team.name}`
            : `Monte o elenco de ${team.name}`
        }
        actionLabel={canManagePlayers ? 'Adicionar jogador' : undefined}
        onAction={canManagePlayers ? () => router.push('/players/create') : undefined}
      />
      {canManagePlayers ? (
        <AppButton label="Adicionar jogador" onPress={() => router.push('/players/create')} />
      ) : null}
      {players.length === 0 ? (
        <EmptyState
          title="Nenhum jogador cadastrado ainda"
          description={
            canManagePlayers
              ? 'Convide seus jogadores para comecar ou cadastre o primeiro nome do elenco.'
              : 'O administrador ainda nao cadastrou jogadores neste time.'
          }
          actionLabel={canManagePlayers ? 'Convidar jogadores' : undefined}
          onAction={canManagePlayers ? () => router.push('/team-invite' as never) : undefined}
        />
      ) : null}
      {players.map((player) => {
        const item = stats.find((entry) => entry.player.id === player.id);
        const label = item
          ? `${item.goals} gols - ${item.assists} assistencias - ${item.mvps} MVPs`
          : undefined;

        const canOpen =
          canManagePlayers || (currentPlayer?.id != null && currentPlayer.id === player.id);

        return (
          <PlayerCard
            key={player.id}
            player={player}
            statsLabel={label}
            onPress={canOpen ? () => router.push(`/players/${player.id}`) : undefined}
          />
        );
      })}
    </Screen>
  );
}

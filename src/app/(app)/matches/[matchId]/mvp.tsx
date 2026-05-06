import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  getConfirmedPlayers,
  getMvpSummary,
  hasPlayerVotedMvp,
  isPlayerConfirmedForMatch,
} from '@/lib/match';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectCanManageTeam,
  selectCurrentPlayer,
} from '@/store/selectors';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function MatchMvpScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const canManage = useAppStore(selectCanManageTeam);
  const submitMvpVote = useAppStore((state) => state.submitMvpVote);

  if (!match || match.status !== 'finished') {
    return (
      <Screen>
        <EmptyState
          title="MVP indisponivel"
          description="A votacao so aparece depois que a partida e encerrada."
        />
      </Screen>
    );
  }

  const currentMatch = match;
  const confirmedPlayers = getConfirmedPlayers(snapshot, currentMatch.id);
  const canVote =
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id) &&
    !hasPlayerVotedMvp(snapshot, currentMatch.id, currentPlayer?.id);
  const summary = getMvpSummary(snapshot, currentMatch.id);
  const rankingItems = summary.results.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: summary.winnerPlayerIds.includes(item.playerId) ? 'Lider atual' : 'Na disputa',
      value: item.votes,
    };
  });

  async function vote(targetPlayerId: string) {
    try {
      await submitMvpVote({ matchId: currentMatch.id, targetPlayerId });
    } catch (error) {
      Alert.alert(
        'Nao foi possivel votar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Votacao de MVP</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Apenas jogadores confirmados podem votar e cada conta vota apenas uma vez por partida.
        </Text>
      </View>

      {canVote ? (
        <View style={styles.voteSection}>
          <SectionHeader title="Escolha seu MVP" subtitle="Toque para registrar seu voto" />
          {confirmedPlayers.map((player) => (
            <AppButton
              key={player.id}
              label={`Votar em #${player.jerseyNumber} ${player.nickname}`}
              variant="secondary"
              onPress={() => vote(player.id)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          title={currentPlayer ? 'Seu voto ja foi usado' : 'Sem permissao para votar'}
          description={
            currentPlayer
              ? 'Voce ja registrou seu MVP nesta partida ou nao estava confirmado.'
              : 'E preciso estar vinculado a um jogador confirmado para votar.'
          }
        />
      )}

      {canManage ? (
        rankingItems.length > 0 ? (
          <RankingList title="Resultado parcial do MVP" items={rankingItems} />
        ) : (
          <EmptyState
            title="Sem votos ainda"
            description="Assim que os jogadores votarem, o placar parcial aparece aqui para o admin."
          />
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  voteSection: {
    gap: 12,
  },
});

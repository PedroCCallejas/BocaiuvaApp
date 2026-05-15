import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getConfirmedPlayers,
  hasPlayerVotedMvp,
  isPlayerConfirmedForMatch,
} from '@/lib/match';
import { buildMatchMvpBreakdown, formatStatNumber } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectCanManageTeam,
  selectCurrentPlayer,
} from '@/store/selectors';

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
  const availableTargets = confirmedPlayers.filter((player) => player.id !== currentPlayer?.id);
  const currentPlayerConfirmed = isPlayerConfirmedForMatch(
    snapshot,
    currentMatch.id,
    currentPlayer?.id,
  );
  const hasAlreadyVoted = hasPlayerVotedMvp(snapshot, currentMatch.id, currentPlayer?.id);
  const canVote =
    availableTargets.length > 0 &&
    currentPlayerConfirmed &&
    !hasAlreadyVoted;
  const breakdown = buildMatchMvpBreakdown(snapshot, currentMatch.id);
  const leaderLabel =
    breakdown.totalVotes === 0
      ? 'Sem votos ainda'
      : breakdown.hasTie
        ? `${breakdown.winnerPlayerIds.length} jogadores empatados`
        : confirmedPlayers.find((player) => player.id === breakdown.winnerPlayerIds[0])?.nickname ??
          'Lider definido';

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
        <Text style={[styles.title, { color: theme.colors.text }]}>MVP da partida</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          O placar mostra apenas quem recebeu voto. O app nunca revela quem votou em quem.
        </Text>
      </View>

      {canVote ? (
        <View style={styles.voteSection}>
          <SectionHeader title="Escolha seu MVP" subtitle="Cada jogador confirmado vota uma vez" />
          {availableTargets.map((player) => (
            <AppButton
              key={player.id}
              label={`Votar em #${player.jerseyNumber} ${player.nickname}`}
              variant="secondary"
              onPress={() => vote(player.id)}
            />
          ))}
        </View>
      ) : (
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}>
          <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
            {currentPlayer == null
              ? 'Resultado liberado'
              : hasAlreadyVoted
                ? 'Seu voto ja foi registrado'
                : currentPlayerConfirmed
                  ? 'Aguardando seu voto'
                  : 'Voce nao estava confirmado para votar'}
          </Text>
          <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
            {currentPlayer == null
              ? 'Mesmo sem estar vinculado a um jogador, voce pode acompanhar o resultado anonimo da votacao.'
              : hasAlreadyVoted
                ? 'Seu voto entrou no placar e o resultado abaixo continua anonimo para todo mundo.'
                : currentPlayerConfirmed
                  ? 'Escolha um companheiro confirmado para liberar seu voto.'
                  : 'O resultado continua visivel, mas apenas jogadores confirmados podem votar.'}
          </Text>
          {canManage ? (
            <Text style={[styles.infoText, { color: theme.colors.secondary }]}>
              Como admin, voce acompanha o resumo completo sem expor votantes.
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.metricsRow}>
        <MetricCard label="Total de votos" value={String(breakdown.totalVotes)} helper="na partida" />
        <MetricCard
          label="Receberam voto"
          value={String(breakdown.playersWithVotesCount)}
          helper="jogadores"
        />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard label="Lider atual" value={leaderLabel} helper={breakdown.hasTie ? 'empate no topo' : 'maior votacao'} />
        <MetricCard
          label="Pontos de MVP"
          value={breakdown.totalVotes > 0 ? formatStatNumber(breakdown.awardPointsEach, 2) : '0'}
          helper={breakdown.hasTie ? 'por lider empatado' : 'para o vencedor'}
        />
      </View>

      {breakdown.results.length > 0 ? (
        <>
          <RankingList
            title="Votacao da partida"
            items={breakdown.results.map((item) => {
              const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
              return {
                id: item.playerId,
                label: player?.nickname ?? 'Jogador',
                subtitle: `${item.votes} voto(s) - ${formatStatNumber(item.percentage, 1)}%${item.isLeader ? ' - liderando' : ''}${item.awardPoints > 0 ? ` - ${formatStatNumber(item.awardPoints, 2)} MVP` : ''}`,
                value: item.votes,
                valueLabel: String(item.votes),
              };
            })}
          />

          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}>
            <SectionHeader
              title="Resultado do MVP"
              subtitle={
                breakdown.hasTie
                  ? 'A partida distribui 1 ponto de MVP dividido entre os lideres.'
                  : 'A partida distribui 1 ponto de MVP para o lider isolado.'
              }
            />
            {breakdown.results
              .filter((item) => item.awardPoints > 0)
              .map((item) => {
                const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
                return (
                  <View key={item.playerId} style={styles.resultRow}>
                    <Text style={[styles.resultName, { color: theme.colors.text }]}>
                      {player?.nickname ?? 'Jogador'}
                    </Text>
                    <Text style={[styles.resultValue, { color: theme.colors.secondary }]}>
                      {formatStatNumber(item.awardPoints, 2)} MVP
                    </Text>
                  </View>
                );
              })}
          </View>
        </>
      ) : (
        <EmptyState
          title="Sem votos ainda"
          description="Quando os jogadores confirmados votarem, o ranking anonimo aparece aqui."
        />
      )}
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
  infoCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  infoTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultName: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  resultValue: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '900',
  },
});

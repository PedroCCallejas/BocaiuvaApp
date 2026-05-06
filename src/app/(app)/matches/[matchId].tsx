import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { MatchCard } from '@/components/cards/MatchCard';
import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getConfirmedPlayers,
  getMvpSummary,
  getRatingsSummary,
  hasPlayerVotedMvp,
  isPlayerConfirmedForMatch,
} from '@/lib/match';
import { useAppStore } from '@/store/app-store';
import {
  findLineupByMatchId,
  findMatchById,
  getAttendanceBuckets,
  getAttendanceSummary,
  selectCanManageTeam,
  selectCurrentPlayer,
} from '@/store/selectors';
import type { Player } from '@/types/domain';

export default function MatchDetailsScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const backendMode = useAppStore((state) => state.backendMode);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const lineup = useAppStore((state) => findLineupByMatchId(state, String(matchId)));
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const canManage = useAppStore(selectCanManageTeam);
  const setAttendance = useAppStore((state) => state.setAttendance);
  const updateMatch = useAppStore((state) => state.updateMatch);

  if (!match) {
    return (
      <Screen>
        <EmptyState
          title="Partida nao encontrada"
          description="A partida pode ter sido removida ou o link ficou invalido."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const currentMatch = match;
  const attendanceSummary = getAttendanceSummary({ snapshot }, currentMatch.id);
  const buckets = getAttendanceBuckets({ snapshot }, currentMatch.id);
  const confirmedPlayers = getConfirmedPlayers(snapshot, currentMatch.id);
  const myAttendance = snapshot.attendance.find(
    (item) => item.matchId === currentMatch.id && item.playerId === currentPlayer?.id,
  );
  const canUsePostGame = canManage && currentMatch.status !== 'canceled';
  const supportsAdvancedPostGame = backendMode === 'mock';
  const canVoteMvp =
    supportsAdvancedPostGame &&
    currentMatch.status === 'finished' &&
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id) &&
    !hasPlayerVotedMvp(snapshot, currentMatch.id, currentPlayer?.id);
  const canRatePlayers =
    supportsAdvancedPostGame &&
    currentMatch.status === 'finished' &&
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id);
  const mvpSummary = getMvpSummary(snapshot, currentMatch.id);
  const ratingsSummary = getRatingsSummary(snapshot, currentMatch.id);
  const matchStats = snapshot.matchStats
    .filter((item) => item.matchId === currentMatch.id)
    .sort((left, right) => right.goals + right.assists - (left.goals + left.assists));

  async function respond(status: 'confirmed' | 'absent') {
    if (!currentPlayer) {
      return;
    }

    await setAttendance({ matchId: currentMatch.id, playerId: currentPlayer.id, status });
  }

  async function handleCancelMatch() {
    Alert.alert(
      'Cancelar partida',
      'Essa partida vai sair do fluxo normal do time. Voce pode editar os detalhes depois se precisar.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar partida',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await updateMatch(currentMatch.id, {
                  seasonId: currentMatch.seasonId ?? null,
                  date: currentMatch.date,
                  time: currentMatch.time,
                  venue: currentMatch.venue,
                  opponentName: currentMatch.opponentName,
                  opponentLogoUrl: currentMatch.opponentLogoUrl ?? null,
                  linePlayersCount: currentMatch.linePlayersCount,
                  matchType: currentMatch.matchType,
                  notes: currentMatch.notes ?? '',
                  status: 'canceled',
                });
              } catch (error) {
                Alert.alert(
                  'Nao foi possivel cancelar',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  const mvpRankingItems = mvpSummary.results.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: mvpSummary.winnerPlayerIds.includes(item.playerId) ? 'Lider atual' : 'Na disputa',
      value: item.votes,
    };
  });
  const ratingsRankingItems = ratingsSummary.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: `${item.totalRatings} avaliacao(oes)`,
      value: item.overallAverage,
    };
  });

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {currentMatch.opponentName}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {MATCH_TYPE_LABELS[currentMatch.matchType]} - {currentMatch.venue}
        </Text>
      </View>

      <MatchCard match={currentMatch} attendance={attendanceSummary} />

      {canManage && currentMatch.status !== 'finished' && currentMatch.status !== 'canceled' ? (
        <View style={styles.section}>
          <SectionHeader title="Ajustes da partida" subtitle="Edite os detalhes ou cancele este jogo" />
          <View style={styles.buttonRow}>
            <AppButton
              label="Editar partida"
              variant="secondary"
              onPress={() => router.push(`/matches/${currentMatch.id}/edit`)}
            />
            <AppButton
              label="Cancelar partida"
              variant="danger"
              onPress={() => void handleCancelMatch()}
            />
          </View>
        </View>
      ) : null}

      {currentMatch.status === 'canceled' ? (
        <EmptyState
          title="Partida cancelada"
          description="Essa partida foi retirada do fluxo normal do time e nao recebe mais presenca nem escalacao."
        />
      ) : null}

      {currentPlayer && currentMatch.status !== 'finished' && currentMatch.status !== 'canceled' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Sua presenca"
            subtitle={`Status atual: ${myAttendance?.status ?? 'pendente'}`}
          />
          <View style={styles.buttonRow}>
            <AppButton label="Confirmar" onPress={() => respond('confirmed')} />
            <AppButton label="Nao vou" variant="danger" onPress={() => respond('absent')} />
          </View>
        </View>
      ) : null}

      {currentMatch.status !== 'finished' && currentMatch.status !== 'canceled' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Escalacao"
            subtitle={lineup ? 'Escalacao salva para esta partida.' : 'Monte a arte da escalacao do jogo.'}
          />
          <AppButton
            label="Abrir escalacao visual"
            variant="secondary"
            onPress={() => router.push(`/lineup/${currentMatch.id}`)}
          />
        </View>
      ) : null}

      {canUsePostGame ? (
        <View style={styles.section}>
          <SectionHeader
            title="Pos-jogo"
            subtitle={
              currentMatch.status === 'finished'
                ? supportsAdvancedPostGame
                  ? 'Revisar placar, gols e assistencias'
                  : 'Revisar o placar salvo para esta partida'
                : supportsAdvancedPostGame
                  ? 'Encerrar a partida e registrar estatisticas'
                  : 'Feche a partida e salve o placar desta etapa'
            }
          />
          <AppButton
            label={currentMatch.status === 'finished' ? 'Atualizar placar' : 'Fechar partida'}
            onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
          />
        </View>
      ) : null}

      {supportsAdvancedPostGame && currentMatch.status === 'finished' ? (
        <>
          <View style={styles.section}>
            <SectionHeader
              title="Interacoes pos-jogo"
              subtitle="MVP e notas ficam disponiveis para jogadores confirmados"
            />
            <View style={styles.buttonRow}>
              <AppButton
                label={canVoteMvp ? 'Votar MVP' : 'Ver MVP'}
                variant="secondary"
                onPress={() => router.push(`/matches/${currentMatch.id}/mvp`)}
              />
              <AppButton
                label={canRatePlayers ? 'Avaliar jogadores' : 'Ver notas'}
                variant="secondary"
                onPress={() => router.push(`/matches/${currentMatch.id}/ratings`)}
              />
            </View>
          </View>

          {matchStats.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Resumo tecnico" subtitle="Gols e assistencias da partida" />
              {matchStats.map((stat) => {
                const player = confirmedPlayers.find((item) => item.id === stat.playerId);
                if (!player) {
                  return null;
                }

                return (
                  <View
                    key={stat.id}
                    style={[
                      styles.statRow,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}>
                    <Text style={[styles.statName, { color: theme.colors.text }]}>
                      #{player.jerseyNumber} {player.nickname}
                    </Text>
                    <View style={styles.statPills}>
                      <Pill label={`${stat.goals} gol(s)`} color={theme.colors.secondary} />
                      <Pill label={`${stat.assists} assist.`} color={theme.colors.primary} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {canManage ? (
            <>
              {mvpRankingItems.length > 0 ? (
                <RankingList title="Placar do MVP" items={mvpRankingItems} />
              ) : (
                <EmptyState
                  title="Sem votos de MVP"
                  description="O admin consegue acompanhar o placar do MVP assim que os jogadores votarem."
                />
              )}
              {ratingsRankingItems.length > 0 ? (
                <RankingList title="Media geral da partida" items={ratingsRankingItems} />
              ) : (
                <EmptyState
                  title="Sem notas ainda"
                  description="As avaliacoes anonimas vao aparecer aqui assim que forem enviadas."
                />
              )}
            </>
          ) : null}
        </>
      ) : null}

      <AttendanceSection title="Confirmados" players={buckets.confirmed} />
      <AttendanceSection title="Ausentes" players={buckets.absent} />
      <AttendanceSection title="Pendentes" players={buckets.pending} />
    </Screen>
  );
}

function AttendanceSection({ title, players }: { title: string; players: Player[] }) {
  const theme = useAppTheme();

  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={`${players.length} jogador(es)`} />
      <View style={styles.namesWrap}>
        {players.map((player) => (
          <Pill key={player.id} label={player.nickname} color={theme.colors.textMuted} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
  },
  section: {
    gap: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statRow: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  statName: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  statPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  namesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});

import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { MatchCard } from '@/components/cards/MatchCard';
import { MatchDiaryEntryCard } from '@/components/matches/MatchDiaryEntryCard';
import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMatchDateTime, hasMatchElapsedHours } from '@/lib/date';
import { openExternalUrl } from '@/lib/external-url';
import {
  membershipIndicatesPlayer,
} from '@/lib/player-linking';
import {
  getConfirmedPlayers,
  getRatingsSummary,
  hasPlayerVotedMvp,
  isPlayerConfirmedForMatch,
} from '@/lib/match';
import { buildMatchMvpBreakdown, formatStatNumber, PLAYER_STATS_LABELS } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  findLineupByMatchId,
  findMatchById,
  getAttendanceBuckets,
  getMatchDiaryEntriesByMatchId,
  getAttendanceSummary,
  selectCanManageTeam,
  selectCurrentMembership,
  selectCurrentUser,
  selectCurrentPlayer,
  selectTeamPlayers,
} from '@/store/selectors';
import type { AttendanceStatus, Player } from '@/types/domain';

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  confirmed: 'Confirmado',
  absent: 'Ausente',
  pending: 'Pendente',
};

export default function MatchDetailsScreen() {
  const params = useLocalSearchParams<{ matchId?: string | string[] }>();
  const theme = useAppTheme();
  const ready = useAppStore((state) => state.ready);
  const snapshot = useAppStore((state) => state.snapshot);
  const rawMatchId = params.matchId;
  const resolvedMatchId =
    typeof rawMatchId === 'string' ? rawMatchId : rawMatchId?.[0] ?? '';
  const match = useAppStore((state) => findMatchById(state, resolvedMatchId));
  const lineup = useAppStore((state) => findLineupByMatchId(state, resolvedMatchId));
  const currentUser = useAppStore(selectCurrentUser);
  const currentMembership = useAppStore(selectCurrentMembership);
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const teamPlayers = useAppStore(selectTeamPlayers);
  const canManage = useAppStore(selectCanManageTeam);
  const setAttendance = useAppStore((state) => state.setAttendance);
  const updateMatch = useAppStore((state) => state.updateMatch);
  const deleteMatchDiaryEntry = useAppStore((state) => state.deleteMatchDiaryEntry);
  const [navigatingEdit, setNavigatingEdit] = useState(false);
  const navigatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navigatingTimeoutRef.current) {
        clearTimeout(navigatingTimeoutRef.current);
      }
    };
  }, []);

  if (!match) {
    return (
      <Screen>
        <EmptyState
          title="Partida não encontrada"
          description="A partida pode ter sido removida ou o link ficou inválido."
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
  const attendanceByPlayerId = new Map(
    snapshot.attendance
      .filter((item) => item.matchId === currentMatch.id)
      .map((item) => [item.playerId, item]),
  );
  const canUsePlayerActions =
    currentPlayer !== null || membershipIndicatesPlayer(currentMembership);
  const myAttendance = currentPlayer ? attendanceByPlayerId.get(currentPlayer.id) ?? null : null;
  const canEditAttendance =
    currentMatch.status !== 'finished' && currentMatch.status !== 'canceled';
  const canEditMatch =
    ready &&
    canManage &&
    Boolean(currentMatch.id) &&
    currentMatch.status !== 'finished' &&
    currentMatch.status !== 'canceled';
  const canUsePostGame = canManage && currentMatch.status !== 'canceled';
  const shouldPromptFinish =
    canUsePostGame &&
    currentMatch.status !== 'finished' &&
    hasMatchElapsedHours(currentMatch, 24);
  const canVoteMvp =
    currentMatch.status === 'finished' &&
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id) &&
    !hasPlayerVotedMvp(snapshot, currentMatch.id, currentPlayer?.id);
  const canRatePlayers =
    currentMatch.status === 'finished' &&
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id);
  const mvpBreakdown = buildMatchMvpBreakdown(snapshot, currentMatch.id);
  const ratingsSummary = getRatingsSummary(snapshot, currentMatch.id);
  const matchStats = snapshot.matchStats
    .filter((item) => item.matchId === currentMatch.id)
    .sort((left, right) => right.goals + right.assists - (left.goals + left.assists));
  const diaryEntries = getMatchDiaryEntriesByMatchId({ snapshot }, currentMatch.id);
  const playerById = new Map(snapshot.players.map((player) => [player.id, player]));

  async function handleOpenLocation() {
    if (!currentMatch.locationUrl) {
      return;
    }

    try {
      await openExternalUrl(currentMatch.locationUrl);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a localização',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function respond(playerId: string, status: AttendanceStatus) {
    try {
      await setAttendance({ matchId: currentMatch.id, playerId, status });
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar a presença',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function handleCancelMatch() {
    Alert.alert(
      'Cancelar partida',
      'Essa partida vai sair do fluxo normal do time. Você pode editar os detalhes depois se precisar.',
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
                  'Não foi possível cancelar',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  function resetNavigatingEditFallback() {
    if (navigatingTimeoutRef.current) {
      clearTimeout(navigatingTimeoutRef.current);
    }

    navigatingTimeoutRef.current = setTimeout(() => {
      setNavigatingEdit(false);
    }, 1500);
  }

  function handleEditMatch(event?: GestureResponderEvent) {
    event?.stopPropagation?.();

    const nextMatchId = currentMatch.id?.trim();

    if (!nextMatchId || !canEditMatch || navigatingEdit) {
      return;
    }

    try {
      setNavigatingEdit(true);
      resetNavigatingEditFallback();
      router.push({
        pathname: '/matches/[matchId]/edit',
        params: { matchId: nextMatchId },
      });
    } catch (error) {
      if (navigatingTimeoutRef.current) {
        clearTimeout(navigatingTimeoutRef.current);
      }
      setNavigatingEdit(false);
      Alert.alert(
        'Não foi possível abrir a edição',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleOpenDiaryEntry(entryId?: string) {
    router.push({
      pathname: '/matches/[matchId]/diary-entry',
      params: entryId
        ? {
            matchId: currentMatch.id,
            entryId,
          }
        : {
            matchId: currentMatch.id,
          },
    });
  }

  function handleDeleteDiaryEntry(entryId: string) {
    Alert.alert(
      'Excluir resenha',
      'Essa publicação sai do diário da partida e remove as notificações vinculadas.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteMatchDiaryEntry(entryId);
              } catch (error) {
                Alert.alert(
                  'Não foi possível excluir a resenha',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  const mvpRankingItems = mvpBreakdown.results.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: `${item.votes} voto(s) - ${formatStatNumber(item.percentage, 1)}%${item.isLeader ? ' - lider atual' : ''}${item.awardPoints > 0 ? ` - ${formatStatNumber(item.awardPoints, 2)} MVP` : ''}`,
      value: item.votes,
      valueLabel: String(item.votes),
    };
  });
  const ratingsRankingItems = ratingsSummary.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: `${item.totalRatings} avaliação(ões)`,
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
          {MATCH_TYPE_LABELS[currentMatch.matchType]} - {formatMatchDateTime(currentMatch)}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {currentMatch.venue}
        </Text>
      </View>

      <MatchCard match={currentMatch} attendance={attendanceSummary} />

      <View style={styles.section}>
        <SectionHeader
          title="Local da partida"
          subtitle={currentMatch.locationUrl ? 'Abra o caminho no seu app de mapas.' : 'Endereço informado para o elenco.'}
        />
        <Text style={[styles.locationText, { color: theme.colors.text }]}>
          {currentMatch.venue}
        </Text>
        {currentMatch.locationUrl ? (
          <AppButton
            label="Abrir localização"
            variant="secondary"
            onPress={() => void handleOpenLocation()}
          />
        ) : null}
      </View>

      {canEditMatch ? (
        <View style={styles.section}>
          <SectionHeader title="Ajustes da partida" subtitle="Edite os detalhes ou cancele este jogo" />
          <View style={styles.buttonRow}>
            <AppButton
              label="Editar partida"
              variant="secondary"
              loading={navigatingEdit}
              disabled={!canEditMatch}
              onPress={handleEditMatch}
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
          description="Essa partida foi retirada do fluxo normal do time e não recebe mais presença nem escalação."
        />
      ) : null}

      {shouldPromptFinish ? (
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.secondary,
            },
          ]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
            Esta partida já aconteceu
          </Text>
          <Text style={[styles.description, { color: theme.colors.textMuted }]}>
            Encerre o jogo para registrar o resultado, as estatísticas e liberar as interações de pós-jogo.
          </Text>
          <AppButton
            label="Encerrar jogo"
            onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
          />
        </View>
      ) : null}

      {canUsePlayerActions &&
      canEditAttendance ? (
        <View style={styles.section}>
          <SectionHeader
            title="Sua presença"
            subtitle={`Status atual: ${ATTENDANCE_STATUS_LABELS[myAttendance?.status ?? 'pending']}`}
          />
          {currentPlayer ? (
            <View style={styles.buttonRow}>
              <AppButton
                label="Vou jogar"
                disabled={myAttendance?.status === 'confirmed'}
                onPress={() => void respond(currentPlayer.id, 'confirmed')}
              />
              <AppButton
                label="Não vou"
                variant="danger"
                disabled={myAttendance?.status === 'absent'}
                onPress={() => void respond(currentPlayer.id, 'absent')}
              />
              <AppButton
                label="Limpar presença"
                variant="ghost"
                disabled={myAttendance?.status === 'pending'}
                onPress={() => void respond(currentPlayer.id, 'pending')}
              />
            </View>
          ) : (
            <Text style={[styles.description, { color: theme.colors.textMuted }]}>
              Estamos preparando sua participação no elenco para esta partida.
            </Text>
          )}
        </View>
      ) : null}

      {canManage && canEditAttendance ? (
        <View style={styles.section}>
          <SectionHeader
            title="Presença do elenco"
            subtitle="Como admin, você pode ajustar a resposta de qualquer jogador."
          />
          {teamPlayers.map((player) => {
            const attendance = attendanceByPlayerId.get(player.id) ?? null;
            const isCurrentPlayer = currentPlayer?.id === player.id;

            return (
              <View
                key={player.id}
                style={[
                  styles.attendanceAdminCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <View style={styles.attendanceAdminHeader}>
                  <View style={styles.attendanceAdminCopy}>
                    <Text style={[styles.statName, { color: theme.colors.text }]}>
                      #{player.jerseyNumber} {player.nickname}
                    </Text>
                    <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
                      {ATTENDANCE_STATUS_LABELS[attendance?.status ?? 'pending']}
                      {isCurrentPlayer ? ' - sua conta' : ''}
                    </Text>
                  </View>
                  <Pill
                    label={ATTENDANCE_STATUS_LABELS[attendance?.status ?? 'pending']}
                    color={theme.colors.secondary}
                  />
                </View>
                <View style={styles.buttonRow}>
                  <AppButton
                    label="Vou jogar"
                    variant="secondary"
                    disabled={attendance?.status === 'confirmed'}
                    onPress={() => void respond(player.id, 'confirmed')}
                  />
                  <AppButton
                    label="Não vou"
                    variant="danger"
                    disabled={attendance?.status === 'absent'}
                    onPress={() => void respond(player.id, 'absent')}
                  />
                  <AppButton
                    label="Limpar presença"
                    variant="ghost"
                    disabled={attendance?.status === 'pending'}
                    onPress={() => void respond(player.id, 'pending')}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {currentMatch.status !== 'finished' && currentMatch.status !== 'canceled' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Escalação"
            subtitle={lineup ? 'Escalação salva para esta partida.' : 'Monte a arte da escalação do jogo.'}
          />
          <AppButton
            label="Abrir escalação visual"
            variant="secondary"
            onPress={() => router.push(`/lineup/${currentMatch.id}`)}
          />
        </View>
      ) : null}

      {canUsePostGame ? (
        <View style={styles.section}>
          <SectionHeader
            title={currentMatch.status === 'finished' ? 'Editar estatísticas do jogo' : 'Pós-jogo'}
            subtitle={
              currentMatch.status === 'finished'
                ? 'Revisar placar, gols e assistências'
                : shouldPromptFinish
                  ? 'Esta partida já aconteceu. Encerre o jogo para registrar o resultado.'
                  : 'Encerrar a partida e registrar estatísticas'
            }
          />
          <AppButton
            label={currentMatch.status === 'finished' ? 'Editar estatísticas' : 'Encerrar jogo'}
            onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
          />
        </View>
      ) : null}

      {currentMatch.status === 'finished' ? (
        <>
          <View style={styles.section}>
            <SectionHeader
              title="Interações pós-jogo"
              subtitle="MVP e notas ficam disponíveis para jogadores confirmados"
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
              <SectionHeader title="Resumo técnico" subtitle="Gols e assistências da partida" />
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
                      <Pill
                        label={`${PLAYER_STATS_LABELS.goals}: ${stat.goals}`}
                        color={theme.colors.secondary}
                      />
                      <Pill
                        label={`${PLAYER_STATS_LABELS.assists}: ${stat.assists}`}
                        backgroundColor={theme.colors.primarySoft}
                        borderColor={theme.colors.primary}
                        textColor={theme.colors.text}
                      />
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
                <RankingList title="Nota geral da partida" items={ratingsRankingItems} />
              ) : (
                <EmptyState
                  title="Sem notas ainda"
                  description="As avaliações anônimas vão aparecer aqui assim que forem enviadas."
                />
              )}
            </>
          ) : null}
        </>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title="Diário da partida"
          subtitle={
            diaryEntries.length > 0
              ? `${diaryEntries.length} resenha(s) publicadas para o elenco`
              : canManage
                ? 'Conte a história dessa partida para o elenco.'
                : 'Ainda não há resenha desta partida.'
          }
          actionLabel={canManage ? 'Nova resenha' : undefined}
          onAction={canManage ? () => handleOpenDiaryEntry() : undefined}
        />

        {diaryEntries.length === 0 ? (
          <EmptyState
            title={canManage ? 'Diário vazio por enquanto' : 'Sem resenha publicada'}
            description={
              canManage
                ? 'Publique uma resenha, destaque jogadores e compartilhe o clima da partida com o elenco.'
                : 'Quando a comissão publicar a resenha, ela vai aparecer aqui.'
            }
            actionLabel={canManage ? 'Nova resenha' : undefined}
            onAction={canManage ? () => handleOpenDiaryEntry() : undefined}
          />
        ) : (
          diaryEntries.map((entry) => (
            <MatchDiaryEntryCard
              key={entry.id}
              entry={entry}
              mentionedPlayers={entry.mentionedPlayerIds
                .map((playerId) => playerById.get(playerId))
                .filter((player): player is Player => Boolean(player))}
              onPressMention={(playerId) => router.push(`/players/${playerId}`)}
              onEdit={canManage ? () => handleOpenDiaryEntry(entry.id) : undefined}
              onDelete={canManage ? () => handleDeleteDiaryEntry(entry.id) : undefined}
            />
          ))
        )}
      </View>

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
  noticeCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  noticeTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  attendanceAdminCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  attendanceAdminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  attendanceAdminCopy: {
    flex: 1,
    gap: 4,
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
  playerSub: {
    fontFamily: fonts.body,
    fontSize: 13,
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
  locationText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
});

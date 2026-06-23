import { useMemo, useState } from 'react';
import { Alert, Clipboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
import { PlayerCard, type PlayerCardSummaryItem } from '@/components/cards/PlayerCard';
import { PlayerAchievementBadge } from '@/components/player/PlayerAchievementBadge';
import { PresentationVideoCard } from '@/components/video/PresentationVideoCard';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FOOT_LABELS, PLAYER_STATUS_LABELS, POSITION_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMatchDate, sortMatchesByDate } from '@/lib/date';
import { isPlayerInactive } from '@/lib/player-management';
import { canEditOwnPlayerProfile } from '@/lib/player-profile-access';
import { buildPlayerAchievements, getTopPlayerAchievements } from '@/lib/player-achievements';
import {
  buildPlayerAggregates,
  buildPlayerProfileMetricCards,
  buildRatingSummary,
  formatStatNumber,
  isDateWithinStatsPeriod,
  splitCriteriaSummaryEntries,
} from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  findPlayerById,
  selectActiveTeamRatingCriteria,
  selectCanManagePlayers,
  selectCanManageTeam,
  selectCurrentMembership,
  selectCurrentTeam,
  selectCurrentTeamRatingCriteria,
  selectCurrentUser,
} from '@/store/selectors';
import type { Match, PlayerRating } from '@/types/domain';

type RatingFilterMode = 'all' | 'year' | 'month' | 'last-games';

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected ? theme.colors.secondarySoft : theme.colors.surface,
          borderColor: selected ? theme.colors.secondary : theme.colors.border,
        },
      ]}>
      <Text style={[styles.filterChipText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function getDateParts(date: string) {
  const [year, month] = date.split('-').map((value) => Number(value));
  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildPlayerRatingTrend(
  ratings: PlayerRating[],
  matchById: Map<string, Match>,
  currentCriteria: ReturnType<typeof useAppStore.getState>['snapshot']['ratingCriteria'],
) {
  if (ratings.length === 0) {
    return null;
  }

  const ratingsByMatchId = ratings.reduce<Record<string, PlayerRating[]>>((acc, rating) => {
    acc[rating.matchId] = [...(acc[rating.matchId] ?? []), rating];
    return acc;
  }, {});

  const matchAverages = Object.entries(ratingsByMatchId)
    .map(([matchId, matchRatings]) => {
      const match = matchById.get(matchId);

      if (!match) {
        return null;
      }

      return {
        matchId,
        match,
        overall: buildRatingSummary(matchRatings, currentCriteria).overallAverage,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => {
      const ordered = sortMatchesByDate([left.match, right.match]);
      return ordered[0]?.id === left.match.id ? -1 : 1;
    });

  if (matchAverages.length === 0) {
    return null;
  }

  const recentWindowSize = Math.min(3, matchAverages.length);
  const recentSlice = matchAverages.slice(-recentWindowSize);
  const previousSlice =
    matchAverages.length > recentWindowSize
      ? matchAverages.slice(-recentWindowSize * 2, -recentWindowSize)
      : matchAverages.slice(0, Math.max(1, Math.floor(matchAverages.length / 2)));
  const recentAverage = average(recentSlice.map((item) => item.overall));
  const previousAverage = average(previousSlice.map((item) => item.overall));
  const delta = Number((recentAverage - previousAverage).toFixed(1));

  return {
    recentAverage: Number(recentAverage.toFixed(1)),
    previousAverage: Number(previousAverage.toFixed(1)),
    delta,
    latestMatchLabel: recentSlice[recentSlice.length - 1]
      ? formatMatchDate(recentSlice[recentSlice.length - 1].match)
      : '',
  };
}

export default function PlayerDetailsScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const isWeb = Platform.OS === 'web';
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const currentUser = useAppStore(selectCurrentUser);
  const currentMembership = useAppStore(selectCurrentMembership);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const teamCriteria = useAppStore(selectCurrentTeamRatingCriteria);
  const activeTeamCriteria = useAppStore(selectActiveTeamRatingCriteria);
  const player = useAppStore((state) => findPlayerById(state, String(playerId)));
  const removePlayer = useAppStore((state) => state.removePlayer);
  const reactivatePlayer = useAppStore((state) => state.reactivatePlayer);
  const [filterMode, setFilterMode] = useState<RatingFilterMode>('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showLegacyCriteria, setShowLegacyCriteria] = useState(false);
  const [removePlayerModalVisible, setRemovePlayerModalVisible] = useState(false);
  const [reactivatePlayerModalVisible, setReactivatePlayerModalVisible] = useState(false);
  const [savingRemovePlayer, setSavingRemovePlayer] = useState(false);
  const [savingReactivatePlayer, setSavingReactivatePlayer] = useState(false);

  const playerAchievements = useMemo(
    () =>
      team && player
        ? buildPlayerAchievements({
            player,
            matches: snapshot.matches,
            attendance: snapshot.attendance,
            matchStats: snapshot.matchStats,
            mvpVotes: snapshot.mvpVotes,
            ratings: snapshot.playerRatings,
            ratingCriteria: teamCriteria,
          })
        : [],
    [
      player,
      snapshot.attendance,
      snapshot.matchStats,
      snapshot.matches,
      snapshot.mvpVotes,
      snapshot.playerRatings,
      team,
      teamCriteria,
    ],
  );

  const aggregate = useMemo(
    () =>
      team && player
        ? buildPlayerAggregates(snapshot, team.id).find(
            (item) => item.player.id === player.id,
          ) ?? null
        : null,
    [player, team, snapshot],
  );
  const teamFinishedMatches = useMemo(
    () =>
      team
        ? sortMatchesByDate(
            snapshot.matches.filter(
              (match) => match.teamId === team.id && match.status === 'finished',
            ),
          )
        : [],
    [team, snapshot.matches],
  );

  if (!team || !player) {
    return (
      <Screen>
        <EmptyState
          title="Jogador não encontrado"
          description="O cadastro que você tentou abrir não existe mais."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const currentTeam = team;
  const currentPlayerRecord = player;
  const canSelfAccess = canEditOwnPlayerProfile({
    teamId: currentTeam.id,
    user: currentUser,
    membership: currentMembership,
    player: currentPlayerRecord,
    teamPlayers: snapshot.players,
  });
  const canEditPlayer = canManagePlayers || canSelfAccess;
  const presentationVideoUrl =
    currentPlayerRecord.introVideoUrl?.trim() ||
    currentPlayerRecord.presentationVideoUrl?.trim() ||
    null;
  const celebrationVideoUrl = currentPlayerRecord.celebrationVideoUrl?.trim() || null;
  const finishedMatchById = new Map(teamFinishedMatches.map((match) => [match.id, match]));
  const allPlayerRatings = snapshot.playerRatings.filter(
    (rating) =>
      rating.targetPlayerId === currentPlayerRecord.id && finishedMatchById.has(rating.matchId),
  );
  const availableYears = [
    ...new Set(
      allPlayerRatings.map(
        (rating) => getDateParts(finishedMatchById.get(rating.matchId)?.date ?? '').year,
      ),
    ),
  ]
    .filter((year) => year > 0)
    .sort((left, right) => right - left);
  const resolvedYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] ?? new Date().getFullYear();
  const availableMonths = [
    ...new Set(
      allPlayerRatings
        .filter(
          (rating) =>
            getDateParts(finishedMatchById.get(rating.matchId)?.date ?? '').year === resolvedYear,
        )
        .map((rating) => getDateParts(finishedMatchById.get(rating.matchId)?.date ?? '').month),
    ),
  ]
    .filter((month) => month > 0)
    .sort((left, right) => left - right);
  const resolvedMonth = availableMonths.includes(selectedMonth)
    ? selectedMonth
    : availableMonths[0] ?? new Date().getMonth() + 1;

  const filteredRatings = allPlayerRatings.filter((rating) => {
    const match = finishedMatchById.get(rating.matchId);

    if (!match) {
      return false;
    }

    switch (filterMode) {
      case 'year':
        return isDateWithinStatsPeriod(match.date, {
          period: 'year',
          year: resolvedYear,
        });
      case 'month':
        return isDateWithinStatsPeriod(match.date, {
          period: 'month',
          year: resolvedYear,
          month: resolvedMonth,
        });
      case 'last-games': {
        const lastMatchIds = new Set(teamFinishedMatches.slice(-5).map((item) => item.id));
        return lastMatchIds.has(match.id);
      }
      case 'all':
      default:
        return true;
    }
  });

  const ratingSummary = buildRatingSummary(filteredRatings, teamCriteria);
  const aggregateMetricCards = aggregate ? buildPlayerProfileMetricCards(aggregate) : [];
  const criteriaSections = splitCriteriaSummaryEntries(ratingSummary, activeTeamCriteria);
  const activeCriteriaEntries = criteriaSections.active;
  const legacyCriteriaEntries = criteriaSections.legacy;
  const bestCriterion =
    [...activeCriteriaEntries].sort((left, right) => right.adjustedAverage - left.adjustedAverage)[0] ??
    null;
  const improvementCriterion =
    [...activeCriteriaEntries].sort((left, right) => left.adjustedAverage - right.adjustedAverage)[0] ??
    null;
  const trend = buildPlayerRatingTrend(filteredRatings, finishedMatchById, teamCriteria);
  const heroAchievements = getTopPlayerAchievements(playerAchievements, 3);
  const momentAchievements = getTopPlayerAchievements(playerAchievements, 6);
  const heroSummaryItems: PlayerCardSummaryItem[] = [
    { label: 'Gols', value: aggregate ? formatStatNumber(aggregate.goals, 0) : '0' },
    { label: 'Assist.', value: aggregate ? formatStatNumber(aggregate.assists, 0) : '0' },
    { label: 'MVPs', value: aggregate ? formatStatNumber(aggregate.mvpAwards, 2) : '0' },
    { label: 'Média', value: aggregate ? formatStatNumber(aggregate.avgRating, 1) : '0' },
  ];
  const linkLabel = currentPlayerRecord.linkedUserId
    ? 'Conta vinculada'
    : currentPlayerRecord.linkedEmail
      ? `E-mail reservado: ${currentPlayerRecord.linkedEmail}`
      : 'Sem conta vinculada';

  function handleCopyInvite() {
    Clipboard.setString(`Entre no time ${currentTeam.name} usando o código ${currentTeam.inviteCode}.`);
    Alert.alert('Convite copiado', 'A mensagem de convite foi copiada para enviar ao jogador.');
  }

  function handleRemovePlayer() {
    setRemovePlayerModalVisible(true);
  }

  async function confirmRemovePlayer() {
    try {
      setSavingRemovePlayer(true);
      if (__DEV__) {
        console.log('[player-detail] inactivate pressed', {
          playerId: currentPlayerRecord.id,
          uid: currentUser?.id ?? null,
          teamId: currentTeam.id,
          canManageTeam,
        });
      }
      await removePlayer(currentPlayerRecord.id);
      router.replace('/players');
    } catch (error) {
      setSavingRemovePlayer(false);
      setRemovePlayerModalVisible(false);
      Alert.alert(
        'Não foi possível inativar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleReactivatePlayer() {
    setReactivatePlayerModalVisible(true);
  }

  async function confirmReactivatePlayer() {
    try {
      setSavingReactivatePlayer(true);
      if (__DEV__) {
        console.log('[player-detail] reactivate pressed', {
          playerId: currentPlayerRecord.id,
          uid: currentUser?.id ?? null,
          teamId: currentTeam.id,
          canManageTeam,
        });
      }
      await reactivatePlayer(currentPlayerRecord.id);
      setReactivatePlayerModalVisible(false);
    } catch (error) {
      Alert.alert(
        'Não foi possível reativar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSavingReactivatePlayer(false);
    }
  }

  return (
    <Screen>
      {!isWeb ? (
        <SectionHeader
          title={`#${currentPlayerRecord.jerseyNumber} ${currentPlayerRecord.nickname}`}
          subtitle={currentPlayerRecord.fullName}
          actionLabel={canEditPlayer ? 'Editar' : undefined}
          onAction={
            canEditPlayer
              ? () => router.push(`/players/${currentPlayerRecord.id}/edit`)
              : undefined
          }
        />
      ) : null}

      <PlayerCard
        player={currentPlayerRecord}
        variant="profile"
        achievements={heroAchievements}
        summaryItems={heroSummaryItems}
      />

      {canManageTeam || canManagePlayers || canEditPlayer ? (
        <View style={styles.buttonRow}>
          {canEditPlayer ? (
            <AppButton
              label={canManagePlayers ? 'Editar jogador' : 'Editar meu perfil'}
              onPress={() => router.push(`/players/${currentPlayerRecord.id}/edit`)}
            />
          ) : null}
          {canManageTeam ? (
            <AppButton label="Copiar convite" variant="secondary" onPress={handleCopyInvite} />
          ) : null}
          {canManageTeam ? (
            isPlayerInactive(currentPlayerRecord) ? (
              <AppButton label="Reativar jogador" onPress={handleReactivatePlayer} />
            ) : (
              <AppButton label="Inativar jogador" variant="danger" onPress={handleRemovePlayer} />
            )
          ) : null}
        </View>
      ) : null}

      {presentationVideoUrl ? (
        <PresentationVideoCard
          title="Vídeo de apresentação"
          description="Um vídeo curto para apresentar o atleta e reforçar a identidade do elenco."
          videoUrl={presentationVideoUrl}
          posterUrl={currentPlayerRecord.photoUrl ?? currentTeam.logoUrl ?? null}
          accentColors={[currentTeam.primaryColor, currentTeam.secondaryColor]}
        />
      ) : null}

      {celebrationVideoUrl && celebrationVideoUrl !== presentationVideoUrl ? (
        <PresentationVideoCard
          title="Video de comemoracao"
          description="Um link publico para destacar o estilo do jogador nas comemoracoes."
          videoUrl={celebrationVideoUrl}
          posterUrl={currentPlayerRecord.photoUrl ?? currentTeam.logoUrl ?? null}
          accentColors={[currentTeam.secondaryColor, currentTeam.primaryColor]}
        />
      ) : null}

      {momentAchievements.length > 0 ? (
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}>
          <SectionHeader
            title="Momento do jogador"
            subtitle="Conquistas dinâmicas baseadas no desempenho recente e no compromisso"
          />
          <View style={styles.achievementGrid}>
            {momentAchievements.map((achievement) => (
              <PlayerAchievementBadge key={achievement.id} achievement={achievement} variant="detail" />
            ))}
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.infoCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.infoTitle, { color: theme.colors.text }]}>Ficha do atleta</Text>
        <View style={styles.pillWrap}>
          <Pill label={PLAYER_STATUS_LABELS[currentPlayerRecord.status]} color={theme.colors.secondary} />
          <Pill label={POSITION_LABELS[currentPlayerRecord.primaryPosition]} color={theme.colors.primary} />
          <Pill label={FOOT_LABELS[currentPlayerRecord.dominantFoot]} color={theme.colors.accent} />
        </View>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{linkLabel}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Também joga:{' '}
          {currentPlayerRecord.secondaryPositions.length > 0
            ? currentPlayerRecord.secondaryPositions
                .map((position) => POSITION_LABELS[position])
                .join(', ')
            : 'Não informadas'}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Se sente melhor em:{' '}
          {currentPlayerRecord.preferredPosition
            ? POSITION_LABELS[currentPlayerRecord.preferredPosition]
            : 'Não informada'}
        </Text>
        {currentPlayerRecord.bio ? (
          <Text style={[styles.bio, { color: theme.colors.textMuted }]}>{currentPlayerRecord.bio}</Text>
        ) : null}
      </View>

      {aggregate ? (
        <>
          <View style={styles.metricsRow}>
            <MetricCard
              label={aggregateMetricCards[0]?.label ?? 'Jogos'}
              value={aggregateMetricCards[0]?.value ?? '0'}
              helper={aggregateMetricCards[0]?.helper}
            />
            <MetricCard
              label={aggregateMetricCards[1]?.label ?? 'Gols'}
              value={aggregateMetricCards[1]?.value ?? '0'}
              helper={aggregateMetricCards[1]?.helper}
            />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
                label={aggregateMetricCards[2]?.label ?? 'Assistências'}
              value={aggregateMetricCards[2]?.value ?? '0'}
              helper={aggregateMetricCards[2]?.helper}
            />
            <MetricCard
                label={aggregateMetricCards[3]?.label ?? 'Participações em gol'}
              value={aggregateMetricCards[3]?.value ?? '0'}
              helper={aggregateMetricCards[3]?.helper}
            />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              label={aggregateMetricCards[4]?.label ?? 'Nota geral'}
              value={aggregateMetricCards[4]?.value ?? '0'}
              helper={aggregateMetricCards[4]?.helper}
            />
            <MetricCard
              label={aggregateMetricCards[5]?.label ?? 'MVPs'}
              value={aggregateMetricCards[5]?.value ?? '0'}
              helper={aggregateMetricCards[5]?.helper}
            />
          </View>

          {aggregate.manualHistoryIncluded ? (
            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}>
              <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
                Correção de estatísticas aplicada
              </Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                Os totais gerais deste jogador consideram correções manuais somadas aos números
                calculados pelo app. As partidas oficiais continuam intactas.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <View
        style={[
          styles.ratingsCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <SectionHeader
          title="Notas recebidas"
          subtitle="Resumo por critério no recorte selecionado"
        />

        <View style={styles.filterGroup}>
          <View style={styles.filterRow}>
            <FilterChip label="Geral" selected={filterMode === 'all'} onPress={() => setFilterMode('all')} />
            <FilterChip label="Ano" selected={filterMode === 'year'} onPress={() => setFilterMode('year')} />
            <FilterChip label="Mês" selected={filterMode === 'month'} onPress={() => setFilterMode('month')} />
            <FilterChip
              label="Últ. 5 jogos"
              selected={filterMode === 'last-games'}
              onPress={() => setFilterMode('last-games')}
            />
          </View>
        </View>

        {filterMode === 'year' || filterMode === 'month' ? (
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Ano</Text>
            <View style={styles.filterRow}>
              {availableYears.map((year) => (
                <FilterChip
                  key={year}
                  label={String(year)}
                  selected={resolvedYear === year}
                  onPress={() => setSelectedYear(year)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {filterMode === 'month' ? (
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.colors.textMuted }]}>Mês</Text>
            <View style={styles.filterRow}>
              {availableMonths.map((month) => (
                <FilterChip
                  key={month}
                  label={MONTH_LABELS[month - 1] ?? String(month)}
                  selected={resolvedMonth === month}
                  onPress={() => setSelectedMonth(month)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {ratingSummary.totalRatings > 0 ? (
          <>
            <View style={styles.metricsRow}>
              <MetricCard
                label="Nota geral"
                value={formatStatNumber(ratingSummary.overallAverage, 1)}
                helper="média do recorte"
              />
              <MetricCard
                label="Avaliações"
                value={String(ratingSummary.totalRatings)}
                helper="consideradas no filtro"
              />
            </View>

            <View style={styles.metricsRow}>
              <MetricCard
                label="Melhor critério"
                value={bestCriterion?.label ?? '-'}
                helper={
                  bestCriterion
                    ? `${formatStatNumber(bestCriterion.average, 1)} - ${
                        bestCriterion.type === 'negative' ? 'alerta controlado' : 'destaque'
                      }`
                    : legacyCriteriaEntries.length > 0
                      ? 'Use os critérios ativos abaixo'
                      : 'Sem comparativo'
                }
              />
              <MetricCard
                label="A melhorar"
                value={improvementCriterion?.label ?? '-'}
                helper={
                  improvementCriterion
                    ? `${formatStatNumber(improvementCriterion.average, 1)} - ${
                        improvementCriterion.type === 'negative'
                          ? 'quanto menor, melhor'
                          : 'pode crescer'
                      }`
                    : legacyCriteriaEntries.length > 0
                      ? 'Os critérios antigos ficaram separados'
                      : 'Sem comparativo'
                }
              />
            </View>

            <View style={styles.metricsRow}>
              <MetricCard
                label="Evolução"
                value={
                  trend
                    ? trend.delta > 0
                      ? `+${formatStatNumber(trend.delta, 1)}`
                      : formatStatNumber(trend.delta, 1)
                    : '-'
                }
                helper={trend ? 'últimos jogos vs bloco anterior' : 'Pouco histórico para comparar'}
              />
              <MetricCard
                label="Último recorte"
                value={trend ? formatStatNumber(trend.recentAverage, 1) : '-'}
                helper={trend?.latestMatchLabel ? `ate ${trend.latestMatchLabel}` : 'Sem data'}
              />
            </View>

            {activeCriteriaEntries.length > 0 ? (
              <View style={styles.criteriaSection}>
                <Text style={[styles.criteriaSectionTitle, { color: theme.colors.text }]}>
                  Critérios ativos do time
                </Text>
                <View style={styles.criteriaGrid}>
                  {activeCriteriaEntries.map((item) => (
                    <View
                      key={item.criterionId}
                      style={[
                        styles.criteriaCard,
                        {
                          backgroundColor: theme.colors.backgroundElevated,
                          borderColor: theme.colors.border,
                        },
                      ]}>
                      <Text style={[styles.criteriaLabel, { color: theme.colors.text }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.criteriaValue, { color: theme.colors.text }]}>
                        {formatStatNumber(item.average, 1)}
                      </Text>
                      <Text style={[styles.criteriaMeta, { color: theme.colors.textMuted }]}>
                        {item.count} avaliação(ões) -{' '}
                        {item.type === 'negative' ? 'quanto menor, melhor' : 'quanto maior, melhor'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : legacyCriteriaEntries.length > 0 ? (
              <View
                style={[
                  styles.criteriaNoticeCard,
                  {
                    backgroundColor: theme.colors.backgroundElevated,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <Text style={[styles.criteriaSectionTitle, { color: theme.colors.text }]}>
                  Sem critérios ativos neste recorte
                </Text>
                <Text style={[styles.criteriaMeta, { color: theme.colors.textMuted }]}>
                  As notas deste período existem apenas em critérios antigos. Abra o histórico
                  abaixo para consultar o detalhe sem misturar com os critérios atuais do time.
                </Text>
              </View>
            ) : null}

            {legacyCriteriaEntries.length > 0 ? (
              <View style={styles.criteriaSection}>
                <Pressable
                  onPress={() => setShowLegacyCriteria((current) => !current)}
                  style={[
                    styles.legacyToggle,
                    {
                      backgroundColor: theme.colors.backgroundElevated,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <View style={styles.legacyToggleCopy}>
                    <Text style={[styles.criteriaSectionTitle, { color: theme.colors.text }]}>
                      Histórico de critérios antigos
                    </Text>
                    <Text style={[styles.criteriaMeta, { color: theme.colors.textMuted }]}>
                      {legacyCriteriaEntries.length} critério(s) fora dos ativos atuais do time.
                    </Text>
                  </View>
                  <Text style={[styles.legacyToggleAction, { color: theme.colors.primary }]}>
                    {showLegacyCriteria ? 'Ocultar critérios antigos' : 'Ver critérios antigos'}
                  </Text>
                </Pressable>

                {showLegacyCriteria ? (
                  <View style={styles.criteriaGrid}>
                    {legacyCriteriaEntries.map((item) => (
                      <View
                        key={item.criterionId}
                        style={[
                          styles.criteriaCard,
                          styles.legacyCriteriaCard,
                          {
                            backgroundColor: theme.colors.backgroundElevated,
                            borderColor: theme.colors.border,
                          },
                        ]}>
                        <Text style={[styles.criteriaLabel, { color: theme.colors.text }]}>
                          {item.label}
                        </Text>
                        <Text style={[styles.criteriaValue, { color: theme.colors.text }]}>
                          {formatStatNumber(item.average, 1)}
                        </Text>
                        <Text style={[styles.criteriaMeta, { color: theme.colors.textMuted }]}>
                          Critério antigo - {item.count} avaliação(ões) -{' '}
                          {item.type === 'negative' ? 'quanto menor, melhor' : 'quanto maior, melhor'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            Este jogador ainda não recebeu avaliações no recorte selecionado.
          </Text>
        )}
      </View>

      <ConfirmModal
        visible={removePlayerModalVisible}
        title="Inativar jogador"
        description={
          currentPlayerRecord.linkedUserId
            ? 'Este jogador não aparecerá como ativo no elenco, mas o histórico será preservado. Se houver conta vinculada, o acesso como jogador sai do elenco ativo; administradores continuam com a gestão.'
            : 'Este jogador não aparecerá como ativo no elenco, mas o histórico será preservado.'
        }
        confirmLabel="Inativar jogador"
        onConfirm={() => void confirmRemovePlayer()}
        onCancel={() => setRemovePlayerModalVisible(false)}
        loading={savingRemovePlayer}
        destructive
      />
      <ConfirmModal
        visible={reactivatePlayerModalVisible}
        title="Reativar jogador"
        description="Esse cadastro volta ao elenco ativo, preserva o histórico e entra novamente nas partidas abertas do time."
        confirmLabel="Reativar jogador"
        cancelLabel="Voltar"
        onConfirm={() => void confirmReactivatePlayer()}
        onCancel={() => setReactivatePlayerModalVisible(false)}
        loading={savingReactivatePlayer}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  ratingsCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  infoTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  bio: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  achievementGrid: {
    gap: 12,
  },
  criteriaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  criteriaSection: {
    gap: 12,
  },
  criteriaSectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  criteriaNoticeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  criteriaCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    minWidth: 150,
    gap: 6,
  },
  legacyCriteriaCard: {
    opacity: 0.94,
  },
  criteriaLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  criteriaValue: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '900',
  },
  criteriaMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  legacyToggle: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  legacyToggleCopy: {
    gap: 4,
  },
  legacyToggleAction: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});

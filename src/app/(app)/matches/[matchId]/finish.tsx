import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
import { AppButton } from '@/components/ui/AppButton';
import { CounterField } from '@/components/ui/CounterField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { calculateMatchResult, getConfirmedPlayers } from '@/lib/match';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectCanManageTeam,
  selectCurrentTeam,
} from '@/store/selectors';

function buildPlayerStatsState(
  playerIds: string[],
  existingStats: Array<{ playerId: string; goals: number; assists: number }>,
) {
  return playerIds.reduce<Record<string, { goals: number; assists: number }>>((acc, playerId) => {
    const stat = existingStats.find((item) => item.playerId === playerId);
    acc[playerId] = {
      goals: stat?.goals ?? 0,
      assists: stat?.assists ?? 0,
    };
    return acc;
  }, {});
}

function sumGoals(playerStats: Record<string, { goals: number; assists: number }>) {
  return Object.values(playerStats).reduce((sum, item) => sum + Math.max(item.goals, 0), 0);
}

function sumAssists(playerStats: Record<string, { goals: number; assists: number }>) {
  return Object.values(playerStats).reduce(
    (sum, item) => sum + Math.max(item.assists, 0),
    0,
  );
}

export default function FinishMatchScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const canManage = useAppStore(selectCanManageTeam);
  const finishMatch = useAppStore((state) => state.finishMatch);
  const currentMatch = match ?? null;
  const confirmedPlayers = useMemo(
    () => (currentMatch ? getConfirmedPlayers(snapshot, currentMatch.id) : []),
    [currentMatch, snapshot],
  );
  const existingStats = useMemo(
    () =>
      currentMatch
        ? snapshot.matchStats.filter((item) => item.matchId === currentMatch.id)
        : [],
    [currentMatch, snapshot.matchStats],
  );
  const confirmedPlayerIds = useMemo(
    () => confirmedPlayers.map((player) => player.id),
    [confirmedPlayers],
  );
  const initialPlayerStats = useMemo(
    () => buildPlayerStatsState(confirmedPlayerIds, existingStats),
    [confirmedPlayerIds, existingStats],
  );
  const initialOwnGoalsForTeam = currentMatch?.scoreboard?.ownGoalsForTeam ?? 0;
  const initialComputedTeamGoals = useMemo(
    () => sumGoals(initialPlayerStats) + initialOwnGoalsForTeam,
    [initialOwnGoalsForTeam, initialPlayerStats],
  );
  const [teamScore, setTeamScore] = useState(
    currentMatch?.scoreboard?.team ?? initialComputedTeamGoals,
  );
  const [opponentScore, setOpponentScore] = useState(currentMatch?.scoreboard?.opponent ?? 0);
  const [ownGoalsForTeam, setOwnGoalsForTeam] = useState(initialOwnGoalsForTeam);
  const [teamScoreManuallyEdited, setTeamScoreManuallyEdited] = useState(false);
  const [playerStats, setPlayerStats] = useState(initialPlayerStats);

  useEffect(() => {
    if (!currentMatch) {
      return;
    }

    setPlayerStats(initialPlayerStats);
    setOwnGoalsForTeam(initialOwnGoalsForTeam);
    setOpponentScore(currentMatch.scoreboard?.opponent ?? 0);
    setTeamScore(currentMatch.scoreboard?.team ?? initialComputedTeamGoals);
    setTeamScoreManuallyEdited(false);
  }, [
    currentMatch?.id,
    currentMatch?.scoreboard?.opponent,
    currentMatch?.scoreboard?.team,
    initialComputedTeamGoals,
    initialOwnGoalsForTeam,
    initialPlayerStats,
  ]);

  const totalPlayerGoals = useMemo(() => sumGoals(playerStats), [playerStats]);
  const totalAssists = useMemo(() => sumAssists(playerStats), [playerStats]);
  const totalTeamGoals = totalPlayerGoals + ownGoalsForTeam;

  useEffect(() => {
    if (!teamScoreManuallyEdited) {
      setTeamScore(totalTeamGoals);
    }
  }, [teamScoreManuallyEdited, totalTeamGoals]);

  const resultLabel = useMemo(() => {
    const result = calculateMatchResult(teamScore, opponentScore);
    if (result === 'win') {
      return 'Vitoria';
    }
    if (result === 'loss') {
      return 'Derrota';
    }
    return 'Empate';
  }, [opponentScore, teamScore]);

  const hasTeamScoreWarning = teamScore !== totalTeamGoals;
  const hasAssistsWarning = totalAssists > totalPlayerGoals;

  const updatePlayerStat = useCallback(
    (playerId: string, key: 'goals' | 'assists', value: number) => {
      setPlayerStats((current) => ({
        ...current,
        [playerId]: {
          goals: key === 'goals' ? value : current[playerId]?.goals ?? 0,
          assists: key === 'assists' ? value : current[playerId]?.assists ?? 0,
        },
      }));
    },
    [],
  );

  const handleTeamScoreChange = useCallback((value: number) => {
    setTeamScoreManuallyEdited(true);
    setTeamScore(value);
  }, []);

  const handleUseAutomaticScore = useCallback(() => {
    setTeamScoreManuallyEdited(false);
    setTeamScore(totalTeamGoals);
  }, [totalTeamGoals]);

  async function handleSave() {
    if (!currentMatch) {
      return;
    }

    try {
      await finishMatch({
        matchId: currentMatch.id,
        teamScore,
        opponentScore,
        ownGoalsForTeam,
        playerStats: confirmedPlayers.map((player) => ({
          playerId: player.id,
          goals: playerStats[player.id]?.goals ?? 0,
          assists: playerStats[player.id]?.assists ?? 0,
        })),
      });
      router.replace(`/matches/${currentMatch.id}`);
    } catch (error) {
      Alert.alert(
        'Nao foi possivel encerrar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  if (!currentMatch || !canManage || !team) {
    return (
      <Screen>
        <EmptyState
          title="Pos-jogo indisponivel"
          description="Apenas o administrador do time pode encerrar a partida."
        />
      </Screen>
    );
  }

  if (confirmedPlayers.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Sem jogadores confirmados"
          description="Confirme a presenca do elenco antes de registrar o pos-jogo."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {currentMatch.status === 'finished'
            ? 'Editar estatisticas do jogo'
            : 'Encerrar partida'}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {currentMatch.status === 'finished'
            ? 'Ajuste placar, gols, assistencias e gol contra a favor sem apagar MVP ou avaliacoes.'
            : 'O placar do time e preenchido automaticamente pela soma dos gols dos jogadores e dos gols contra do adversario.'}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard
          label="Gols lancados"
          value={String(totalPlayerGoals)}
          helper="somados dos jogadores"
        />
        <MetricCard
          label="Assistencias"
          value={String(totalAssists)}
          helper="lancadas na partida"
        />
        <MetricCard
          label="Placar atual"
          value={`${teamScore} x ${opponentScore}`}
          helper={resultLabel}
        />
      </View>

      {hasTeamScoreWarning ? (
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.warning,
            },
          ]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
            Placar diferente da soma dos gols
          </Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
            O time esta com {teamScore} gol(s), mas a soma dos gols lancados mais gols contra
            a favor resulta em {totalTeamGoals}.
          </Text>
          <AppButton
            label="Usar soma automatica"
            variant="secondary"
            onPress={handleUseAutomaticScore}
          />
        </View>
      ) : null}

      {hasAssistsWarning ? (
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.warning,
            },
          ]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
            Confira as assistencias
          </Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
            Existem mais assistencias que gols lancados. Confira se esta correto antes de
            salvar.
          </Text>
        </View>
      ) : null}

      <View style={styles.scoreRow}>
        <CounterField
          label="Gols do time"
          value={teamScore}
          min={0}
          max={30}
          onChange={handleTeamScoreChange}
        />
        <CounterField
          label="Gols tomados"
          value={opponentScore}
          min={0}
          max={30}
          onChange={setOpponentScore}
        />
        <CounterField
          label="Gols contra a nosso favor"
          value={ownGoalsForTeam}
          min={0}
          max={30}
          onChange={setOwnGoalsForTeam}
        />
      </View>

      <SectionHeader title="Resultado" subtitle={resultLabel} />

      {confirmedPlayers.map((player) => (
        <View
          key={player.id}
          style={[
            styles.playerRow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}>
          <View style={styles.playerCopy}>
            <Text style={[styles.playerName, { color: theme.colors.text }]}>
              #{player.jerseyNumber} {player.nickname}
            </Text>
            <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
              {player.fullName}
            </Text>
          </View>
          <View style={styles.counterRow}>
            <CounterField
              label="Gols"
              value={playerStats[player.id]?.goals ?? 0}
              min={0}
              onChange={(value) => updatePlayerStat(player.id, 'goals', value)}
            />
            <CounterField
              label="Assistências"
              value={playerStats[player.id]?.assists ?? 0}
              min={0}
              onChange={(value) => updatePlayerStat(player.id, 'assists', value)}
            />
          </View>
        </View>
      ))}

      <AppButton
        label={currentMatch.status === 'finished' ? 'Salvar estatisticas' : 'Encerrar jogo'}
        onPress={handleSave}
        fullWidth
      />
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
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  noticeTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  playerRow: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  playerCopy: {
    gap: 4,
  },
  playerName: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  playerSub: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  counterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

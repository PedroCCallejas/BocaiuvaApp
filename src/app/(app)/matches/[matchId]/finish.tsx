import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CounterField } from '@/components/ui/CounterField';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { calculateMatchResult, getConfirmedPlayers } from '@/lib/match';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectCanManageTeam,
  selectCurrentTeam,
} from '@/store/selectors';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function FinishMatchScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const backendMode = useAppStore((state) => state.backendMode);
  const team = useAppStore(selectCurrentTeam);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const canManage = useAppStore(selectCanManageTeam);
  const finishMatch = useAppStore((state) => state.finishMatch);
  const supportsDetailedStats = backendMode === 'mock';

  if (!match || !canManage || !team) {
    return (
      <Screen>
        <EmptyState
          title="Pos-jogo indisponivel"
          description="Apenas o administrador do time pode encerrar a partida."
        />
      </Screen>
    );
  }

  const currentMatch = match;
  const confirmedPlayers = getConfirmedPlayers(snapshot, currentMatch.id);
  const existingStats = snapshot.matchStats.filter((item) => item.matchId === currentMatch.id);
  const [teamScore, setTeamScore] = useState(currentMatch.scoreboard?.team ?? 0);
  const [opponentScore, setOpponentScore] = useState(currentMatch.scoreboard?.opponent ?? 0);
  const [playerStats, setPlayerStats] = useState<Record<string, { goals: number; assists: number }>>(
    () =>
      confirmedPlayers.reduce<Record<string, { goals: number; assists: number }>>((acc, player) => {
        const stat = existingStats.find((item) => item.playerId === player.id);
        acc[player.id] = { goals: stat?.goals ?? 0, assists: stat?.assists ?? 0 };
        return acc;
      }, {}),
  );

  const resultLabel = useMemo(() => {
    const result = calculateMatchResult(teamScore, opponentScore);
    if (result === 'win') {
      return 'Vitoria';
    }
    if (result === 'loss') {
      return 'Derrota';
    }
    return 'Empate';
  }, [teamScore, opponentScore]);

  async function handleSave() {
    try {
      await finishMatch({
        matchId: currentMatch.id,
        teamScore,
        opponentScore,
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

  if (supportsDetailedStats && confirmedPlayers.length === 0) {
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
        <Text style={[styles.title, { color: theme.colors.text }]}>Encerrar partida</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {supportsDetailedStats
            ? 'Placar, gols e assistencias entram no estado global e atualizam estatisticas e rankings automaticamente.'
            : 'Nesta etapa, voce salva o placar e fecha a partida. As estatisticas individuais entram depois.'}
        </Text>
      </View>

      <View style={styles.scoreRow}>
        <CounterField label={team.name} value={teamScore} max={30} onChange={setTeamScore} />
        <CounterField
          label={currentMatch.opponentName}
          value={opponentScore}
          max={30}
          onChange={setOpponentScore}
        />
      </View>

      <SectionHeader title="Resultado" subtitle={resultLabel} />

      {supportsDetailedStats
        ? confirmedPlayers.map((player) => (
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
                  onChange={(value) =>
                    setPlayerStats((current) => ({
                      ...current,
                      [player.id]: { goals: value, assists: current[player.id]?.assists ?? 0 },
                    }))
                  }
                />
                <CounterField
                  label="Assist."
                  value={playerStats[player.id]?.assists ?? 0}
                  onChange={(value) =>
                    setPlayerStats((current) => ({
                      ...current,
                      [player.id]: { goals: current[player.id]?.goals ?? 0, assists: value },
                    }))
                  }
                />
              </View>
            </View>
          ))
        : (
          <View
            style={[
              styles.playerRow,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}>
            <Text style={[styles.playerName, { color: theme.colors.text }]}>
              Fechamento simplificado
            </Text>
            <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
              O placar fica salvo agora e as estatisticas individuais entram numa etapa futura.
            </Text>
          </View>
        )}

      <AppButton
        label={currentMatch.status === 'finished' ? 'Atualizar placar' : 'Fechar partida'}
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

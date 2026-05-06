import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { LineupField } from '@/components/lineup/LineupField';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildLineupFromPreset, getFormationPresets } from '@/lib/lineup';
import { useAppStore } from '@/store/app-store';
import {
  findLineupByMatchId,
  findMatchById,
  selectCanManageTeam,
  selectTeamPlayers,
} from '@/store/selectors';
import type { LineupNode, Player } from '@/types/domain';

export default function LineupScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const existingLineup = useAppStore((state) => findLineupByMatchId(state, String(matchId)));
  const players = useAppStore(selectTeamPlayers);
  const canManage = useAppStore(selectCanManageTeam);
  const saveLineup = useAppStore((state) => state.saveLineup);
  const currentMatch = match ?? null;
  const presets = currentMatch
    ? getFormationPresets(currentMatch.matchType, currentMatch.linePlayersCount)
    : [];
  const fallbackPreset = presets[0] ?? null;
  const confirmedPlayers = currentMatch
    ? snapshot.attendance
        .filter((item) => item.matchId === currentMatch.id && item.status === 'confirmed')
        .map((item) => players.find((player) => player.id === item.playerId))
        .filter((player): player is Player => Boolean(player))
    : [];
  const availablePlayers = confirmedPlayers;
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(
    existingLineup?.formationKey ?? fallbackPreset?.key ?? '',
  );
  const [starters, setStarters] = useState<LineupNode[]>(existingLineup?.starters ?? []);
  const [benchPlayerIds, setBenchPlayerIds] = useState<string[]>(
    existingLineup?.benchPlayerIds ?? [],
  );

  useEffect(() => {
    if (!currentMatch || !fallbackPreset) {
      return;
    }

    if (existingLineup) {
      setSelectedPreset(existingLineup.formationKey);
      setStarters(existingLineup.starters);
      setBenchPlayerIds(existingLineup.benchPlayerIds);
      return;
    }

    const preset = presets.find((item) => item.key === selectedPreset) ?? fallbackPreset;
    const autoLineup = buildLineupFromPreset(preset, availablePlayers);
    setStarters(autoLineup.starters);
    setBenchPlayerIds(autoLineup.benchPlayerIds);
  }, [availablePlayers, currentMatch?.id, existingLineup, fallbackPreset, presets, selectedPreset]);

  if (!currentMatch || !canManage) {
    return (
      <Screen>
        <EmptyState
          title="Escalacao indisponivel"
          description="Apenas o administrador do time pode montar e salvar a escalacao."
        />
      </Screen>
    );
  }

  if (currentMatch.status === 'finished' || currentMatch.status === 'canceled') {
    return (
      <Screen>
        <EmptyState
          title="Escalacao bloqueada"
          description="A escalacao pode ser ajustada apenas antes do encerramento da partida."
        />
      </Screen>
    );
  }

  if (!fallbackPreset) {
    return (
      <Screen>
        <EmptyState
          title="Sem formacao disponivel"
          description="Ainda nao encontramos uma formacao compativel com este tipo de partida."
        />
      </Screen>
    );
  }

  if (confirmedPlayers.length < fallbackPreset.starterCount) {
    return (
      <Screen>
        <EmptyState
          title="Confirmacoes insuficientes"
          description={`Voce precisa de pelo menos ${fallbackPreset.starterCount} jogadores confirmados para montar a escalacao.`}
        />
      </Screen>
    );
  }

  const matchRecord = currentMatch;

  async function handleSave() {
    await saveLineup({
      matchId: matchRecord.id,
      formationKey: selectedPreset,
      starters,
      benchPlayerIds,
    });
    Alert.alert('Escalacao salva', 'A distribuicao dos jogadores foi atualizada com sucesso.');
  }

  function swapStarterWithBench(benchPlayerId: string) {
    if (!selectedStarterId) {
      return;
    }

    const selectedStarter = starters.find((node) => node.playerId === selectedStarterId);
    if (!selectedStarter) {
      return;
    }

    setStarters((current) =>
      current.map((node) =>
        node.playerId === selectedStarterId ? { ...node, playerId: benchPlayerId } : node,
      ),
    );
    setBenchPlayerIds((current) =>
      current.map((playerId) => (playerId === benchPlayerId ? selectedStarterId : playerId)),
    );
    setSelectedStarterId(null);
  }

  const benchPlayers = benchPlayerIds
    .map((playerId) => players.find((player) => player.id === playerId))
    .filter((player): player is Player => Boolean(player));
  const selectedStarterPlayer = players.find((player) => player.id === selectedStarterId) ?? null;

  return (
    <Screen>
      <SectionHeader
        title="Escalacao visual"
        subtitle={`${matchRecord.opponentName} - ${matchRecord.linePlayersCount + 1} em campo`}
      />
      <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
        Arraste os titulares livremente no campo. Para trocar com o banco, toque em um titular e depois em um reserva.
      </Text>
      <View style={styles.formationRow}>
        {presets.map((preset) => {
          const selected = selectedPreset === preset.key;
          return (
            <Pressable
              key={preset.key}
              onPress={() => {
                setSelectedPreset(preset.key);
                setSelectedStarterId(null);
                const autoLineup = buildLineupFromPreset(preset, availablePlayers);
                setStarters(autoLineup.starters);
                setBenchPlayerIds(autoLineup.benchPlayerIds);
              }}
              style={[
                styles.formationChip,
                {
                  backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                },
              ]}>
              <Text style={[styles.formationText, { color: theme.colors.text }]}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <LineupField
        starters={starters}
        players={players}
        selectedStarterId={selectedStarterId}
        onSelectStarter={(playerId) =>
          setSelectedStarterId((current) => (current === playerId ? null : playerId))
        }
        onChange={setStarters}
      />

      <View style={styles.benchSection}>
        <SectionHeader
          title="Reservas"
          subtitle={
            selectedStarterPlayer
              ? `Trocar com ${selectedStarterPlayer.nickname}`
              : `${benchPlayers.length} no banco`
          }
        />
        <View style={styles.benchWrap}>
          {benchPlayers.map((player) => (
            <Pressable
              key={player.id}
              onPress={() => swapStarterWithBench(player.id)}
              style={[
                styles.benchCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}>
              <Text style={[styles.benchName, { color: theme.colors.text }]}>
                #{player.jerseyNumber} {player.nickname}
              </Text>
              <Text style={[styles.benchSub, { color: theme.colors.textMuted }]}>
                {selectedStarterPlayer ? 'Toque para entrar em campo' : 'Toque apos selecionar um titular'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.actionRow}>
        <AppButton
          label="Auto organizar"
          variant="secondary"
          onPress={() => {
            const preset = presets.find((item) => item.key === selectedPreset) ?? fallbackPreset;
            if (!preset) {
              return;
            }

            setSelectedStarterId(null);
            const autoLineup = buildLineupFromPreset(preset, availablePlayers);
            setStarters(autoLineup.starters);
            setBenchPlayerIds(autoLineup.benchPlayerIds);
          }}
        />
        <AppButton label="Salvar escalacao" onPress={() => void handleSave()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  helper: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  formationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  formationChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  formationText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  benchSection: {
    gap: 12,
  },
  benchWrap: {
    gap: 10,
  },
  benchCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  benchName: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  benchSub: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});

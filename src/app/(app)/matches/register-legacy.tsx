import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { CounterField } from '@/components/ui/CounterField';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR, isValidTime, parseDateBRToISO } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManageTeam,
  selectCurrentTeam,
  selectTeamHistoricalPlayers,
} from '@/store/selectors';
import type { MatchType } from '@/types/domain';

const schema = z.object({
  opponentName: z.string().min(3, 'Informe o adversario.'),
  date: z.string().refine((value) => Boolean(parseDateBRToISO(value)), {
    message: 'Use o formato DD/MM/AAAA.',
  }),
  time: z.string().refine((value) => isValidTime(value), {
    message: 'Use o formato HH:mm ou deixe em branco.',
  }),
  venue: z.string().optional(),
  notes: z.string().optional(),
  matchType: z.enum(['society', 'futsal', 'field', 'training']),
});

type LegacyMatchValues = z.infer<typeof schema>;

export default function RegisterLegacyMatchScreen() {
  const theme = useAppTheme();
  const team = useAppStore(selectCurrentTeam);
  const canManage = useAppStore(selectCanManageTeam);
  const teamPlayers = useAppStore(selectTeamHistoricalPlayers);
  const registerFinishedMatch = useAppStore((state) => state.registerFinishedMatch);
  const [teamScore, setTeamScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [selectedPlayers, setSelectedPlayers] = useState<
    Record<string, { goals: number; assists: number }>
  >({});
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LegacyMatchValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      opponentName: '',
      date: formatDateBR(new Date()),
      time: '',
      venue: '',
      notes: '',
      matchType: 'society',
    },
  });

  const totalGoals = useMemo(
    () => Object.values(selectedPlayers).reduce((sum, item) => sum + item.goals, 0),
    [selectedPlayers],
  );
  const selectedCount = Object.keys(selectedPlayers).length;

  if (!team || !canManage) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Somente quem administra o time pode registrar jogos antigos."
        />
      </Screen>
    );
  }

  const currentTeam = team;

  function togglePlayer(playerId: string) {
    setSelectedPlayers((current) => {
      if (current[playerId]) {
        const next = { ...current };
        delete next[playerId];
        return next;
      }

      return {
        ...current,
        [playerId]: {
          goals: 0,
          assists: 0,
        },
      };
    });
  }

  function updatePlayerStats(
    playerId: string,
    key: 'goals' | 'assists',
    value: number,
  ) {
    setSelectedPlayers((current) => ({
      ...current,
      [playerId]: {
        goals: current[playerId]?.goals ?? 0,
        assists: current[playerId]?.assists ?? 0,
        [key]: value,
      },
    }));
  }

  async function onSubmit(values: LegacyMatchValues) {
    if (selectedCount === 0) {
      Alert.alert('Selecione participantes', 'Marque pelo menos um jogador que participou da partida.');
      return;
    }

    if (totalGoals > teamScore) {
      Alert.alert(
        'Placar inconsistente',
        'A soma de gols dos jogadores nao pode ultrapassar o placar do time.',
      );
      return;
    }

    try {
      const matchId = await registerFinishedMatch({
        seasonId: currentTeam.activeSeasonId ?? null,
        date: parseDateBRToISO(values.date) ?? values.date,
        time: values.time.trim(),
        venue: values.venue?.trim() || null,
        matchType: values.matchType,
        notes: values.notes?.trim() ?? '',
        opponentName: values.opponentName.trim(),
        teamScore,
        opponentScore,
        players: Object.entries(selectedPlayers).map(([playerId, stats]) => ({
          playerId,
          played: true,
          started: true,
          goals: stats.goals,
          assists: stats.assists,
        })),
      });
      router.replace(`/matches/${matchId}`);
    } catch (error) {
      Alert.alert(
        'Nao foi possivel registrar o jogo',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  const goalWarning =
    selectedCount > 0 && totalGoals !== teamScore
      ? totalGoals > teamScore
        ? 'A soma de gols dos jogadores ultrapassa o placar do time.'
        : 'A soma de gols dos jogadores esta diferente do placar informado.'
      : null;

  return (
    <Screen formMode>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Registrar jogo antigo</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Use este fluxo para salvar partidas passadas ja encerradas com placar e estatisticas individuais.
        </Text>
      </View>

      <View style={styles.scoreRow}>
        <CounterField label={currentTeam.name} value={teamScore} max={30} onChange={setTeamScore} />
        <CounterField
          label="Gols tomados"
          value={opponentScore}
          max={30}
          onChange={setOpponentScore}
        />
      </View>

      {goalWarning ? (
        <Text
          style={[
            styles.warning,
            {
              color: totalGoals > teamScore ? theme.colors.danger : theme.colors.secondary,
            },
          ]}>
          {goalWarning}
        </Text>
      ) : null}

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Controller
          control={control}
          name="opponentName"
          render={({ field }) => (
            <AppInput
              label="Adversario"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.opponentName?.message}
            />
          )}
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <Controller
              control={control}
              name="date"
              render={({ field }) => (
                <AppInput
                  label="Data"
                  keyboardType="number-pad"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={errors.date?.message}
                />
              )}
            />
          </View>
          <View style={styles.half}>
            <Controller
              control={control}
              name="time"
              render={({ field }) => (
                <AppInput
                  label="Horario opcional"
                  keyboardType="numbers-and-punctuation"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={errors.time?.message}
                />
              )}
            />
          </View>
        </View>
        <Controller
          control={control}
          name="venue"
          render={({ field }) => (
            <AppInput
              label="Local opcional"
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.venue?.message}
            />
          )}
        />
        <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Tipo de partida</Text>
        <View style={styles.chipRow}>
          {(['society', 'futsal', 'field', 'training'] as MatchType[]).map((type) => {
            const selected = watch('matchType') === type;
            return (
              <Pressable
                key={type}
                onPress={() => setValue('matchType', type)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceMuted,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                ]}>
                <Text style={[styles.chipLabel, { color: theme.colors.text }]}>
                  {MATCH_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <AppInput
              label="Observacoes"
              multiline
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              style={styles.multiline}
            />
          )}
        />
      </View>

      <SectionHeader
        title="Participantes"
        subtitle={`${selectedCount} jogador(es) marcado(s) para este jogo`}
      />
      {teamPlayers.map((player) => {
        const selected = selectedPlayers[player.id];

        return (
          <View
            key={player.id}
            style={[
              styles.playerCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
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

            <AppButton
              label={selected ? 'Remover da partida' : 'Marcar participou'}
              variant={selected ? 'danger' : 'secondary'}
              onPress={() => togglePlayer(player.id)}
            />

            {selected ? (
              <View style={styles.counterRow}>
                <CounterField
                  label="Gols"
                  value={selected.goals}
                  onChange={(value) => updatePlayerStats(player.id, 'goals', value)}
                />
                <CounterField
                  label="Assistências"
                  value={selected.assists}
                  onChange={(value) => updatePlayerStats(player.id, 'assists', value)}
                />
              </View>
            ) : null}
          </View>
        );
      })}

      <AppButton
        label="Salvar jogo antigo"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
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
  warning: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 18,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  fieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chipLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
    paddingTop: 16,
  },
  playerCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
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

import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Screen } from '@/components/ui/Screen';
import { LINE_PLAYER_OPTIONS, MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import { selectCanManageTeam, selectCurrentTeam } from '@/store/selectors';
import type { MatchType } from '@/types/domain';

const schema = z.object({
  opponentName: z.string().min(3, 'Informe o adversario.'),
  date: z.string().min(10, 'Use o formato YYYY-MM-DD.'),
  time: z.string().min(5, 'Use o formato HH:mm.'),
  venue: z.string().min(3, 'Informe o local.'),
  notes: z.string().optional(),
  matchType: z.enum(['society', 'futsal', 'field', 'training']),
  linePlayersCount: z.number().min(4),
});

type MatchValues = z.infer<typeof schema>;

export default function CreateMatchScreen() {
  const theme = useAppTheme();
  const canManage = useAppStore(selectCanManageTeam);
  const team = useAppStore(selectCurrentTeam);
  const createMatch = useAppStore((state) => state.createMatch);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MatchValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      opponentName: 'Novo adversario',
      date: '2026-05-20',
      time: '20:00',
      venue: 'Campo principal',
      notes: '',
      matchType: 'society',
      linePlayersCount: 6,
    },
  });

  if (!team || !canManage) {
    return null;
  }

  const currentTeam = team;

  async function onSubmit(values: MatchValues) {
    try {
      const matchId = await createMatch({
        ...values,
        teamId: currentTeam.id,
        seasonId: currentTeam.activeSeasonId ?? null,
      });
      router.replace(`/matches/${matchId}`);
    } catch (error) {
      Alert.alert('Nao foi possivel criar a partida', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Criar nova partida</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          A criacao da partida ja gera presenca pendente para todo o elenco do time.
        </Text>
      </View>

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
        <Controller
          control={control}
          name="venue"
          render={({ field }) => (
            <AppInput
              label="Local"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.venue?.message}
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
                  label="Horario"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  error={errors.time?.message}
                />
              )}
            />
          </View>
        </View>
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
        <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Jogadores em campo</Text>
        <View style={styles.chipRow}>
          {LINE_PLAYER_OPTIONS.map((count) => {
            const selected = watch('linePlayersCount') === count;
            return (
              <Pressable
                key={count}
                onPress={() => setValue('linePlayersCount', count)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.secondarySoft : theme.colors.surfaceMuted,
                    borderColor: selected ? theme.colors.secondary : theme.colors.border,
                  },
                ]}>
                <Text style={[styles.chipLabel, { color: theme.colors.text }]}>{count + 1}</Text>
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
        <AppButton
          label="Salvar partida"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          fullWidth
        />
      </View>
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
});

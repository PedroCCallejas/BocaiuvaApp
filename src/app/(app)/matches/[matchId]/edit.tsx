import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR, isValidTime, parseDateBRToISO } from '@/lib/date';
import { isValidExternalUrl } from '@/lib/url';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectCanManageTeam,
  selectCurrentTeam,
} from '@/store/selectors';
import type { MatchType } from '@/types/domain';

const schema = z.object({
  opponentName: z.string().min(3, 'Informe o adversario.'),
  date: z.string().refine((value) => Boolean(parseDateBRToISO(value)), {
    message: 'Use o formato DD/MM/AAAA.',
  }),
  time: z.string().refine((value) => isValidTime(value), {
    message: 'Use o formato HH:mm.',
  }),
  venue: z.string().min(3, 'Informe o local.'),
  locationUrl: z
    .string()
    .optional()
    .refine((value) => !value?.trim() || isValidExternalUrl(value), {
      message: 'Cole um link valido de mapas.',
    }),
  notes: z.string().optional(),
  matchType: z.enum(['society', 'futsal', 'field', 'training']),
  linePlayersCount: z
    .string()
    .min(1, 'Informe quantos jogadores de linha vao para o jogo.')
    .refine((value) => /^\d+$/.test(value.trim()), {
      message: 'Use apenas numeros inteiros.',
    })
    .refine((value) => {
      const count = Number(value.trim());
      return count >= 1 && count <= 15;
    }, 'Escolha um numero entre 1 e 15 jogadores de linha.'),
});

type MatchValues = z.infer<typeof schema>;

export default function EditMatchScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const team = useAppStore(selectCurrentTeam);
  const canManage = useAppStore(selectCanManageTeam);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const updateMatch = useAppStore((state) => state.updateMatch);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MatchValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      opponentName: match?.opponentName ?? 'Novo adversario',
      date: formatDateBR(match?.date ?? '2026-05-20'),
      time: match?.time ?? '20:00',
      venue: match?.venue ?? 'Campo principal',
      locationUrl: match?.locationUrl ?? '',
      notes: match?.notes ?? '',
      matchType: match?.matchType ?? 'society',
      linePlayersCount: String(match?.linePlayersCount ?? 6),
    },
  });

  if (!team || !canManage || !match) {
    return (
      <Screen>
        <EmptyState
          title="Partida indisponivel"
          description="Somente quem administra o time pode editar esta partida."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const currentMatch = match;

  async function onSubmit(values: MatchValues) {
    try {
      await updateMatch(currentMatch.id, {
        seasonId: currentMatch.seasonId ?? null,
        date: parseDateBRToISO(values.date) ?? values.date,
        time: values.time,
        venue: values.venue,
        locationUrl: values.locationUrl?.trim() || null,
        opponentName: values.opponentName,
        opponentLogoUrl: currentMatch.opponentLogoUrl ?? null,
        linePlayersCount: Number(values.linePlayersCount.trim()),
        matchType: values.matchType,
        notes: values.notes?.trim() ?? '',
        status: currentMatch.status,
      });
      router.replace(`/matches/${currentMatch.id}`);
    } catch (error) {
      Alert.alert(
        'Nao foi possivel salvar a partida',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Editar partida</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Ajuste data, horario, local e formato do jogo sem perder o restante do planejamento.
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
        <Controller
          control={control}
          name="locationUrl"
          render={({ field }) => (
            <AppInput
              label="Link da localizacao"
              autoCapitalize="none"
              autoCorrect={false}
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.locationUrl?.message}
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
                  label="Horario"
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
          name="linePlayersCount"
          render={({ field }) => (
            <AppInput
              label="Quantos jogadores de linha"
              keyboardType="number-pad"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.linePlayersCount?.message}
            />
          )}
        />
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
          label="Salvar alteracoes"
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

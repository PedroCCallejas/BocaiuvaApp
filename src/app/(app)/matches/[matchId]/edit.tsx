import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  selectCurrentMembership,
  selectCurrentTeam,
} from '@/store/selectors';
import type { MatchType } from '@/types/domain';

const schema = z.object({
  opponentName: z.string().min(3, 'Informe o adversário.'),
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
      message: 'Cole um link válido de mapas.',
    }),
  notes: z.string().optional(),
  matchType: z.enum(['society', 'futsal', 'field', 'training']),
  linePlayersCount: z
    .string()
    .min(1, 'Informe quantos jogadores de linha vão para o jogo.')
    .refine((value) => /^\d+$/.test(value.trim()), {
      message: 'Use apenas números inteiros.',
    })
    .refine((value) => {
      const count = Number(value.trim());
      return count >= 1 && count <= 15;
    }, 'Escolha um número entre 1 e 15 jogadores de linha.'),
});

type MatchValues = z.infer<typeof schema>;

export default function EditMatchScreen() {
  const params = useLocalSearchParams<{ matchId?: string | string[] }>();
  const theme = useAppTheme();
  const ready = useAppStore((state) => state.ready);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const team = useAppStore(selectCurrentTeam);
  const snapshot = useAppStore((state) => state.snapshot);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const currentMembership = useAppStore(selectCurrentMembership);
  const rawMatchId = params.matchId;
  const resolvedMatchId =
    typeof rawMatchId === 'string' ? rawMatchId : rawMatchId?.[0] ?? '';
  const match = useAppStore((state) => findMatchById(state, resolvedMatchId));
  const updateMatch = useAppStore((state) => state.updateMatch);
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MatchValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      opponentName: '',
      date: '',
      time: '',
      venue: '',
      locationUrl: '',
      notes: '',
      matchType: 'society',
      linePlayersCount: '6',
    },
  });

  useEffect(() => {
    if (!match) {
      return;
    }

    reset({
      opponentName: match.opponentName,
      date: formatDateBR(match.date),
      time: match.time ?? '',
      venue: match.venue ?? '',
      locationUrl: match.locationUrl ?? '',
      notes: match.notes ?? '',
      matchType: match.matchType,
      linePlayersCount: String(match.linePlayersCount ?? 6),
    });
  }, [match, reset]);

  const canManage = useMemo(() => {
    if (!match) return false;
    const matchMembership = snapshot.teamMembers.find(
      (m) =>
        m.userId === currentUserId &&
        m.teamId === match.teamId &&
        m.status === 'active',
    );
    const target = matchMembership ?? currentMembership;
    return (
      (target?.canManageTeam === true) ||
      (Array.isArray(target?.roles) && target.roles.includes('admin'))
    );
  }, [match, currentMembership, currentUserId, snapshot.teamMembers]);

  const waitingForMatch =
    !ready ||
    (syncStatus === 'connecting' && (!match || !team)) ||
    (!match && !resolvedMatchId);

  if (waitingForMatch) {
    return (
      <Screen>
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[styles.description, { color: theme.colors.textMuted }]}>
            Carregando dados da partida...
          </Text>
        </View>
      </Screen>
    );
  }

  if (!match) {
    return (
      <Screen>
        <EmptyState
          title="Partida não encontrada"
          description="Não conseguimos localizar esta partida nos dados atuais do time."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (!team || !canManage) {
    return (
      <Screen>
        <EmptyState
          title="Partida indisponível"
          description="Somente quem administra o time pode editar esta partida."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const currentMatch = match;

  async function onSubmit(values: MatchValues) {
    setSaveError(null);
    try {
      const keepsPublicOpponent =
        currentMatch.opponentSource === 'public_team' &&
        values.opponentName.trim() === (currentMatch.opponentTeamName ?? currentMatch.opponentName);

      await updateMatch(currentMatch.id, {
        seasonId: currentMatch.seasonId ?? null,
        date: parseDateBRToISO(values.date) ?? values.date,
        time: values.time,
        venue: values.venue,
        locationUrl: values.locationUrl?.trim() || null,
        opponentName: values.opponentName,
        opponentLogoUrl: currentMatch.opponentLogoUrl ?? null,
        opponentTeamId: keepsPublicOpponent ? currentMatch.opponentTeamId ?? null : null,
        opponentTeamName: keepsPublicOpponent ? currentMatch.opponentTeamName ?? null : null,
        opponentTeamLogoUrl:
          keepsPublicOpponent ? currentMatch.opponentTeamLogoUrl ?? null : null,
        opponentSource: keepsPublicOpponent ? currentMatch.opponentSource ?? null : 'manual',
        linePlayersCount: Number(values.linePlayersCount.trim()),
        matchType: values.matchType,
        notes: values.notes?.trim() ?? '',
        status: currentMatch.status,
      });
      router.replace(`/matches/${currentMatch.id}`);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'permission-denied') {
        const matchTeam = snapshot.teams.find((t) => t.id === currentMatch.teamId);
        const matchTeamName = matchTeam?.name ?? 'este time';
        const activeTeamName = team?.name ?? null;
        const teamInfo =
          activeTeamName && activeTeamName !== matchTeamName
            ? ` (time ativo: ${activeTeamName})`
            : '';
        setSaveError(
          `Sem permissão de admin para "${matchTeamName}"${teamInfo}. Verifique se você é administrador deste time.`,
        );
      } else {
        setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
      }
    }
  }

  return (
    <Screen formMode>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Editar partida</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Ajuste data, horário, local e formato do jogo sem perder o restante do planejamento.
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
              label="Adversário"
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
              label="Link da localização"
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
                  label="Horário"
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
              label="Observações"
              multiline
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              style={styles.multiline}
            />
          )}
        />
        {saveError ? (
          <Text style={[styles.saveError, { color: theme.colors.danger }]}>{saveError}</Text>
        ) : null}
        <AppButton
          label="Salvar alterações"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
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
  saveError: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});

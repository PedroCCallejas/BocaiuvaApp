import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import {
  FOOT_LABELS,
  FOOT_OPTIONS,
  PLAYER_STATUS_LABELS,
  PLAYER_STATUS_OPTIONS,
  POSITION_LABELS,
  POSITION_OPTIONS,
} from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type {
  FootPreference,
  ManualPlayerStats,
  PlayerStatus,
  Position,
} from '@/types/domain';

type PlayerFormState = {
  fullName: string;
  nickname: string;
  photoUrl?: string;
  jerseyNumber: string;
  primaryPosition: string;
  secondaryPositions: string[];
  dominantFoot: string;
  status: string;
  linkedEmail?: string;
  bio?: string;
  preferredPosition?: string;
  introVideoUrl?: string;
  celebrationVideoUrl?: string;
  allowSelfEditJerseyNumber: boolean;
  manualMatches: string;
  manualGoals: string;
  manualAssists: string;
  manualWins: string;
  manualDraws: string;
  manualLosses: string;
  manualMvps: string;
};

function createPlayerSchema(variant: 'admin' | 'self') {
  return z
    .object({
      fullName: z.string(),
      nickname: z.string().min(2, 'Informe o apelido.'),
      photoUrl: z.string().url('Informe uma URL valida.').or(z.literal('')).optional(),
      jerseyNumber: z.string(),
      primaryPosition: z.string(),
      secondaryPositions: z.array(z.string()),
      dominantFoot: z.string(),
      status: z.string(),
      linkedEmail: z.string().email('Informe um e-mail valido.').or(z.literal('')).optional(),
      bio: z.string().optional(),
      preferredPosition: z.string().optional(),
      introVideoUrl: z.string().url('Informe uma URL valida.').or(z.literal('')).optional(),
      celebrationVideoUrl: z.string().url('Informe uma URL valida.').or(z.literal('')).optional(),
      allowSelfEditJerseyNumber: z.boolean(),
      manualMatches: z.string(),
      manualGoals: z.string(),
      manualAssists: z.string(),
      manualWins: z.string(),
      manualDraws: z.string(),
      manualLosses: z.string(),
      manualMvps: z.string(),
    })
    .superRefine((values, ctx) => {
      if (variant !== 'admin') {
        return;
      }

      if (values.fullName.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fullName'],
          message: 'Informe o nome completo.',
        });
      }

      if (values.jerseyNumber.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jerseyNumber'],
          message: 'Informe o numero da camisa.',
        });
      } else if (Number(values.jerseyNumber) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jerseyNumber'],
          message: 'A camisa deve ser maior que zero.',
        });
      }

      if (!values.primaryPosition.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['primaryPosition'],
          message: 'Escolha a posicao principal.',
        });
      }

      if (!values.dominantFoot.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dominantFoot'],
          message: 'Escolha o pe dominante.',
        });
      }

      if (!values.status.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['status'],
          message: 'Escolha o status do jogador.',
        });
      }

      for (const field of [
        'manualMatches',
        'manualGoals',
        'manualAssists',
        'manualWins',
        'manualDraws',
        'manualLosses',
        'manualMvps',
      ] as const) {
        const value = values[field].trim();
        if (value.length === 0) {
          continue;
        }

        if (!/^\d+$/.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Use apenas numeros inteiros a partir de zero.',
          });
        }
      }
    });
}

export interface PlayerFormPayload {
  fullName: string;
  nickname: string;
  photoUrl?: string | null;
  jerseyNumber: number;
  primaryPosition: Position;
  secondaryPositions: Position[];
  dominantFoot: FootPreference;
  status: PlayerStatus;
  linkedEmail?: string | null;
  bio?: string;
  preferredPosition?: Position | null;
  introVideoUrl?: string | null;
  celebrationVideoUrl?: string | null;
  allowSelfEditJerseyNumber?: boolean;
  manualStats?: ManualPlayerStats;
}

export interface PlayerFormDefaults extends PlayerFormPayload {}

interface PlayerFormProps {
  variant: 'admin' | 'self';
  defaults: PlayerFormDefaults;
  submitLabel: string;
  loading?: boolean;
  helperText?: string;
  onSubmit: (payload: PlayerFormPayload) => Promise<void> | void;
}

export function PlayerForm({
  variant,
  defaults,
  submitLabel,
  loading,
  helperText,
  onSubmit,
}: PlayerFormProps) {
  const theme = useAppTheme();
  const schema = useMemo(() => createPlayerSchema(variant), [variant]);
  const canSelfEditJerseyNumber =
    variant === 'self' &&
    (defaults.allowSelfEditJerseyNumber === true || defaults.jerseyNumber <= 0);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormState>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: defaults.fullName,
      nickname: defaults.nickname,
      photoUrl: defaults.photoUrl ?? '',
      jerseyNumber: String(defaults.jerseyNumber),
      primaryPosition: defaults.primaryPosition,
      secondaryPositions: defaults.secondaryPositions,
      dominantFoot: defaults.dominantFoot,
      status: defaults.status,
      linkedEmail: defaults.linkedEmail ?? '',
      bio: defaults.bio ?? '',
      preferredPosition: defaults.preferredPosition ?? '',
      introVideoUrl: defaults.introVideoUrl ?? '',
      celebrationVideoUrl: defaults.celebrationVideoUrl ?? '',
      allowSelfEditJerseyNumber: defaults.allowSelfEditJerseyNumber ?? false,
      manualMatches: String(defaults.manualStats?.matches ?? 0),
      manualGoals: String(defaults.manualStats?.goals ?? 0),
      manualAssists: String(defaults.manualStats?.assists ?? 0),
      manualWins: String(defaults.manualStats?.wins ?? 0),
      manualDraws: String(defaults.manualStats?.draws ?? 0),
      manualLosses: String(defaults.manualStats?.losses ?? 0),
      manualMvps: String(defaults.manualStats?.mvps ?? 0),
    },
  });

  const primaryPosition = (watch('primaryPosition') || defaults.primaryPosition) as Position;
  const secondaryPositions = (watch('secondaryPositions') || []) as Position[];
  const preferredPosition = watch('preferredPosition') || '';

  async function submit(values: PlayerFormState) {
    const payload: PlayerFormPayload = {
      fullName: variant === 'admin' ? values.fullName.trim() : defaults.fullName,
      nickname: values.nickname.trim(),
      photoUrl: values.photoUrl?.trim() ? values.photoUrl.trim() : null,
      jerseyNumber:
        variant === 'admin' || canSelfEditJerseyNumber
          ? Number(values.jerseyNumber.trim() || String(defaults.jerseyNumber))
          : defaults.jerseyNumber,
      primaryPosition:
        variant === 'admin' ? (values.primaryPosition as Position) : defaults.primaryPosition,
      secondaryPositions:
        variant === 'admin' || variant === 'self'
          ? (values.secondaryPositions as Position[])
          : defaults.secondaryPositions,
      dominantFoot:
        variant === 'admin' || variant === 'self'
          ? (values.dominantFoot as FootPreference)
          : defaults.dominantFoot,
      status: variant === 'admin' ? (values.status as PlayerStatus) : defaults.status,
      linkedEmail:
        variant === 'admin'
          ? values.linkedEmail?.trim() || null
          : defaults.linkedEmail ?? null,
      bio: values.bio?.trim() ?? '',
      preferredPosition: preferredPosition ? (preferredPosition as Position) : null,
      introVideoUrl: values.introVideoUrl?.trim() ? values.introVideoUrl.trim() : null,
      celebrationVideoUrl: values.celebrationVideoUrl?.trim()
        ? values.celebrationVideoUrl.trim()
        : null,
      allowSelfEditJerseyNumber:
        variant === 'admin'
          ? values.allowSelfEditJerseyNumber
          : defaults.allowSelfEditJerseyNumber ?? false,
      manualStats:
        variant === 'admin'
          ? {
              matches: parseStatField(values.manualMatches),
              goals: parseStatField(values.manualGoals),
              assists: parseStatField(values.manualAssists),
              wins: parseStatField(values.manualWins),
              draws: parseStatField(values.manualDraws),
              losses: parseStatField(values.manualLosses),
              mvps: parseStatField(values.manualMvps),
            }
          : defaults.manualStats,
    };

    await onSubmit(payload);
  }

  return (
    <View style={styles.container}>
      {helperText ? (
        <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{helperText}</Text>
      ) : null}

      {variant === 'admin' ? (
        <Controller
          control={control}
          name="fullName"
          render={({ field }) => (
            <AppInput
              label="Nome completo"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.fullName?.message}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="nickname"
        render={({ field }) => (
          <AppInput
            label="Apelido"
            value={field.value}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            error={errors.nickname?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="photoUrl"
        render={({ field }) => (
          <AppInput
            label="Foto (URL por enquanto)"
            autoCapitalize="none"
            autoCorrect={false}
            value={field.value ?? ''}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            error={errors.photoUrl?.message}
          />
        )}
      />

      {variant === 'admin' ? (
        <Controller
          control={control}
          name="linkedEmail"
          render={({ field }) => (
            <AppInput
              label="E-mail reservado para vinculacao"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.linkedEmail?.message}
            />
          )}
        />
      ) : null}

      {variant === 'admin' || canSelfEditJerseyNumber ? (
        <Controller
          control={control}
          name="jerseyNumber"
          render={({ field }) => (
            <AppInput
              label="Numero da camisa"
              keyboardType="number-pad"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.jerseyNumber?.message}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="bio"
        render={({ field }) => (
          <AppInput
            label="Bio curta"
            multiline
            value={field.value ?? ''}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            style={styles.multiline}
            error={errors.bio?.message}
          />
        )}
      />

      {variant === 'admin' ? (
        <ChoiceSection
          title="Posicao principal"
          options={POSITION_OPTIONS}
          selected={[primaryPosition]}
          labelFor={(item) => POSITION_LABELS[item]}
          onToggle={(value) => {
            setValue('primaryPosition', value);
            setValue(
              'secondaryPositions',
              secondaryPositions.filter((item) => item !== value),
            );
          }}
          single
        />
      ) : null}

      <ChoiceSection
        title="Posicoes secundarias"
        options={POSITION_OPTIONS.filter((item) => item !== primaryPosition)}
        selected={secondaryPositions}
        labelFor={(item) => POSITION_LABELS[item]}
        onToggle={(value) => {
          const next = secondaryPositions.includes(value)
            ? secondaryPositions.filter((item) => item !== value)
            : [...secondaryPositions, value];
          setValue('secondaryPositions', next);
        }}
      />

      <ChoiceSection
        title="Posicao preferida"
        options={POSITION_OPTIONS}
        selected={preferredPosition ? [preferredPosition as Position] : []}
        labelFor={(item) => POSITION_LABELS[item]}
        onToggle={(value) =>
          setValue('preferredPosition', preferredPosition === value ? '' : value)
        }
        single
      />

      <ChoiceSection
        title="Pe dominante"
        options={FOOT_OPTIONS}
        selected={[watch('dominantFoot') as FootPreference]}
        labelFor={(item) => FOOT_LABELS[item]}
        onToggle={(value) => setValue('dominantFoot', value)}
        single
      />

      <Controller
        control={control}
        name="introVideoUrl"
        render={({ field }) => (
          <AppInput
            label="Video de apresentacao (URL opcional)"
            autoCapitalize="none"
            autoCorrect={false}
            value={field.value ?? ''}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            error={errors.introVideoUrl?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="celebrationVideoUrl"
        render={({ field }) => (
          <AppInput
            label="Video de comemoracao (URL opcional)"
            autoCapitalize="none"
            autoCorrect={false}
            value={field.value ?? ''}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            error={errors.celebrationVideoUrl?.message}
          />
        )}
      />

      {variant === 'admin' ? (
        <>
          <ChoiceSection
            title="Status"
            options={PLAYER_STATUS_OPTIONS}
            selected={[watch('status') as PlayerStatus]}
            labelFor={(item) => PLAYER_STATUS_LABELS[item]}
            onToggle={(value) => setValue('status', value)}
            single
          />
          <ChoiceSection
            title="Camisa editavel pelo jogador"
            options={['allowed', 'locked']}
            selected={[watch('allowSelfEditJerseyNumber') ? 'allowed' : 'locked']}
            labelFor={(item) =>
              item === 'allowed'
                ? 'Jogador pode ajustar a camisa'
                : 'Somente admin ajusta a camisa'
            }
            onToggle={(value) =>
              setValue('allowSelfEditJerseyNumber', value === 'allowed')
            }
            single
          />
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
              Estatisticas iniciais
            </Text>
            <View style={styles.statsGrid}>
              <Controller
                control={control}
                name="manualMatches"
                render={({ field }) => (
                  <AppInput
                    label="Jogos"
                    keyboardType="number-pad"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.manualMatches?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="manualGoals"
                render={({ field }) => (
                  <AppInput
                    label="Gols"
                    keyboardType="number-pad"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.manualGoals?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="manualAssists"
                render={({ field }) => (
                  <AppInput
                    label="Assistencias"
                    keyboardType="number-pad"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.manualAssists?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="manualMvps"
                render={({ field }) => (
                  <AppInput
                    label="MVPs"
                    keyboardType="number-pad"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.manualMvps?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="manualWins"
                render={({ field }) => (
                  <AppInput
                    label="Vitorias"
                    keyboardType="number-pad"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.manualWins?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="manualDraws"
                render={({ field }) => (
                  <AppInput
                    label="Empates"
                    keyboardType="number-pad"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.manualDraws?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="manualLosses"
                render={({ field }) => (
                  <AppInput
                    label="Derrotas"
                    keyboardType="number-pad"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.manualLosses?.message}
                  />
                )}
              />
            </View>
          </View>
        </>
      ) : null}

      <AppButton
        label={submitLabel}
        onPress={handleSubmit(submit)}
        loading={loading || isSubmitting}
        fullWidth
      />
    </View>
  );
}

function parseStatField(value: string) {
  const sanitized = value.trim();

  if (!sanitized || Number.isNaN(Number(sanitized))) {
    return 0;
  }

  return Math.max(0, Math.floor(Number(sanitized)));
}

function ChoiceSection<T extends string>({
  title,
  options,
  selected,
  labelFor,
  onToggle,
  single,
}: {
  title: string;
  options: T[];
  selected: T[];
  labelFor: (item: T) => string;
  onToggle: (item: T) => void;
  single?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{title}</Text>
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const active = selected.includes(option);

          return (
            <Pressable
              key={option}
              onPress={() => onToggle(option)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                },
              ]}>
              <Text style={[styles.chipLabel, { color: theme.colors.text }]}>
                {labelFor(option)}
                {single && active ? ' *' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  helper: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
    paddingTop: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statsGrid: {
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});

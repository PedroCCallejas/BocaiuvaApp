import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { ImageUploadField } from '@/components/forms/ImageUploadField';
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
import {
  buildManualAdjustmentsFromDesiredTotals,
  formatStatNumber,
  getDesiredTotalsFromManualAdjustments,
} from '@/lib/stats';
import { pickImage, type ImagePickerSource, type SelectedImageAsset } from '@/lib/uploadImage';
import type {
  FootPreference,
  ManualPlayerStats,
  PlayerStatus,
  Position,
} from '@/types/domain';

type PlayerFormState = {
  fullName: string;
  nickname: string;
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
  desiredMatches: string;
  desiredGoals: string;
  desiredAssists: string;
  desiredWins: string;
  desiredDraws: string;
  desiredLosses: string;
  desiredMvps: string;
};

function createPlayerSchema(variant: 'admin' | 'self') {
  return z
    .object({
      fullName: z.string(),
      nickname: z.string().min(2, 'Informe o apelido.'),
      jerseyNumber: z.string(),
      primaryPosition: z.string(),
      secondaryPositions: z.array(z.string()),
      dominantFoot: z.string(),
      status: z.string(),
      linkedEmail: z.string().email('Informe um e-mail válido.').or(z.literal('')).optional(),
      bio: z.string().optional(),
      preferredPosition: z.string().optional(),
      introVideoUrl: z.string().url('Informe uma URL válida.').or(z.literal('')).optional(),
      celebrationVideoUrl: z.string().url('Informe uma URL válida.').or(z.literal('')).optional(),
      allowSelfEditJerseyNumber: z.boolean(),
      desiredMatches: z.string(),
      desiredGoals: z.string(),
      desiredAssists: z.string(),
      desiredWins: z.string(),
      desiredDraws: z.string(),
      desiredLosses: z.string(),
      desiredMvps: z.string(),
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
          message: 'Informe o número da camisa.',
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
          message: 'Escolha a posição principal.',
        });
      }

      if (!values.dominantFoot.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dominantFoot'],
          message: 'Escolha o pé dominante.',
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
        'desiredMatches',
        'desiredGoals',
        'desiredAssists',
        'desiredWins',
        'desiredDraws',
        'desiredLosses',
      ] as const) {
        const value = values[field].trim();
        if (value.length === 0) {
          continue;
        }

        if (!/^\d+$/.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Informe um total inteiro a partir de zero.',
          });
        }
      }

      const desiredMvps = values.desiredMvps.trim();
      if (desiredMvps.length > 0 && !/^\d+(?:[.,]\d{1,2})?$/.test(desiredMvps)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['desiredMvps'],
          message: 'Informe um total válido para MVPs.',
        });
      }
    });
}

export interface PlayerFormPayload {
  fullName: string;
  nickname: string;
  photoUrl?: string | null;
  pendingPhoto?: SelectedImageAsset | null;
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
  imageUploadProgress?: number | null;
  computedStats?: ManualPlayerStats;
  onSubmit: (payload: PlayerFormPayload) => Promise<void> | void;
}

export function PlayerForm({
  variant,
  defaults,
  submitLabel,
  loading,
  helperText,
  imageUploadProgress,
  computedStats,
  onSubmit,
}: PlayerFormProps) {
  const theme = useAppTheme();
  const schema = useMemo(() => createPlayerSchema(variant), [variant]);
  const [pendingPhoto, setPendingPhoto] = useState<SelectedImageAsset | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const normalizedComputedStats = useMemo(
    () =>
      getDesiredTotalsFromManualAdjustments(
        computedStats ?? {
          matches: 0,
          goals: 0,
          assists: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          mvps: 0,
        },
        null,
      ),
    [computedStats],
  );
  const desiredTotalsDefaults = useMemo(
    () =>
      getDesiredTotalsFromManualAdjustments(normalizedComputedStats, defaults.manualStats),
    [defaults.manualStats, normalizedComputedStats],
  );
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
      desiredMatches: formatStatNumber(desiredTotalsDefaults.matches, 0),
      desiredGoals: formatStatNumber(desiredTotalsDefaults.goals, 0),
      desiredAssists: formatStatNumber(desiredTotalsDefaults.assists, 0),
      desiredWins: formatStatNumber(desiredTotalsDefaults.wins, 0),
      desiredDraws: formatStatNumber(desiredTotalsDefaults.draws, 0),
      desiredLosses: formatStatNumber(desiredTotalsDefaults.losses, 0),
      desiredMvps: formatStatNumber(desiredTotalsDefaults.mvps, 2),
    },
  });

  const primaryPosition = (watch('primaryPosition') || defaults.primaryPosition) as Position;
  const secondaryPositions = (watch('secondaryPositions') || []) as Position[];
  const preferredPosition = watch('preferredPosition') || '';
  const currentPhotoUrl = removePhoto ? null : defaults.photoUrl ?? null;
  const desiredTotalsLive = {
    matches: parseWholeNumberField(watch('desiredMatches')),
    goals: parseWholeNumberField(watch('desiredGoals')),
    assists: parseWholeNumberField(watch('desiredAssists')),
    wins: parseWholeNumberField(watch('desiredWins')),
    draws: parseWholeNumberField(watch('desiredDraws')),
    losses: parseWholeNumberField(watch('desiredLosses')),
    mvps: parseDecimalField(watch('desiredMvps')),
  } satisfies ManualPlayerStats;
  const liveManualAdjustments = buildManualAdjustmentsFromDesiredTotals(
    normalizedComputedStats,
    desiredTotalsLive,
  );

  async function handlePickPhoto(source: ImagePickerSource) {
    try {
      const asset = await pickImage(source);
      if (!asset) {
        return;
      }

      setPendingPhoto(asset);
      setRemovePhoto(false);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a imagem',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleClearPhoto() {
    if (pendingPhoto) {
      setPendingPhoto(null);
      return;
    }

    setRemovePhoto(true);
  }

  async function submit(values: PlayerFormState) {
    const desiredTotals = {
      matches: parseWholeNumberField(values.desiredMatches),
      goals: parseWholeNumberField(values.desiredGoals),
      assists: parseWholeNumberField(values.desiredAssists),
      wins: parseWholeNumberField(values.desiredWins),
      draws: parseWholeNumberField(values.desiredDraws),
      losses: parseWholeNumberField(values.desiredLosses),
      mvps: parseDecimalField(values.desiredMvps),
    } satisfies ManualPlayerStats;

    const payload: PlayerFormPayload = {
      fullName: variant === 'admin' ? values.fullName.trim() : defaults.fullName,
      nickname: values.nickname.trim(),
      photoUrl: removePhoto ? null : defaults.photoUrl ?? null,
      pendingPhoto,
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
          ? buildManualAdjustmentsFromDesiredTotals(
              normalizedComputedStats,
              desiredTotals,
            )
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

      <ImageUploadField
        label="Foto do jogador"
        hint="A imagem será comprimida e enviada ao Storage quando você salvar."
        imageUrl={currentPhotoUrl}
        pendingImage={pendingPhoto}
        onPickFromLibrary={() => void handlePickPhoto('library')}
        onPickFromCamera={() => void handlePickPhoto('camera')}
        onClear={currentPhotoUrl || pendingPhoto ? handleClearPhoto : undefined}
        clearLabel={
          pendingPhoto
            ? currentPhotoUrl
              ? 'Cancelar nova foto'
              : 'Remover foto'
            : 'Remover foto'
        }
        emptyLabel="Sem foto"
        shape="circle"
        progress={imageUploadProgress}
        disabled={loading || isSubmitting}
      />

      {variant === 'admin' ? (
        <Controller
          control={control}
          name="linkedEmail"
          render={({ field }) => (
            <AppInput
              label="E-mail reservado para vinculação"
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
              label="Número da camisa"
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
          title="Posição principal"
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
        title="Posições secundárias"
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
        title="Posição preferida"
        options={POSITION_OPTIONS}
        selected={preferredPosition ? [preferredPosition as Position] : []}
        labelFor={(item) => POSITION_LABELS[item]}
        onToggle={(value) =>
          setValue('preferredPosition', preferredPosition === value ? '' : value)
        }
        single
      />

      <ChoiceSection
        title="Pé dominante"
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
            label="Vídeo de apresentação (URL opcional)"
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
            label="Vídeo de comemoração (URL opcional)"
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
            title="Camisa editável pelo jogador"
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
              Correção de estatísticas
            </Text>
            <Text style={[styles.sectionHelper, { color: theme.colors.textMuted }]}>
              Informe o total correto do jogador. O app calcula automaticamente a diferença entre
              o total informado e o que já foi registrado nas partidas.
            </Text>

            <View style={styles.statsGrid}>
              <StatsCorrectionField
                label="Jogos"
                computedValue={normalizedComputedStats.matches}
                adjustmentValue={liveManualAdjustments.matches}
                inputValue={watch('desiredMatches')}
                error={errors.desiredMatches?.message}
                keyboardType="number-pad"
                onChangeText={(value) => setValue('desiredMatches', value)}
              />
              <StatsCorrectionField
                label="Gols"
                computedValue={normalizedComputedStats.goals}
                adjustmentValue={liveManualAdjustments.goals}
                inputValue={watch('desiredGoals')}
                error={errors.desiredGoals?.message}
                keyboardType="number-pad"
                onChangeText={(value) => setValue('desiredGoals', value)}
              />
              <StatsCorrectionField
                label="Assistências"
                computedValue={normalizedComputedStats.assists}
                adjustmentValue={liveManualAdjustments.assists}
                inputValue={watch('desiredAssists')}
                error={errors.desiredAssists?.message}
                keyboardType="number-pad"
                onChangeText={(value) => setValue('desiredAssists', value)}
              />
              <StatsCorrectionField
                label="MVPs"
                computedValue={normalizedComputedStats.mvps}
                adjustmentValue={liveManualAdjustments.mvps}
                inputValue={watch('desiredMvps')}
                error={errors.desiredMvps?.message}
                keyboardType="decimal-pad"
                allowDecimal
                onChangeText={(value) => setValue('desiredMvps', value)}
              />
              <StatsCorrectionField
                label="Vitórias"
                computedValue={normalizedComputedStats.wins}
                adjustmentValue={liveManualAdjustments.wins}
                inputValue={watch('desiredWins')}
                error={errors.desiredWins?.message}
                keyboardType="number-pad"
                onChangeText={(value) => setValue('desiredWins', value)}
              />
              <StatsCorrectionField
                label="Empates"
                computedValue={normalizedComputedStats.draws}
                adjustmentValue={liveManualAdjustments.draws}
                inputValue={watch('desiredDraws')}
                error={errors.desiredDraws?.message}
                keyboardType="number-pad"
                onChangeText={(value) => setValue('desiredDraws', value)}
              />
              <StatsCorrectionField
                label="Derrotas"
                computedValue={normalizedComputedStats.losses}
                adjustmentValue={liveManualAdjustments.losses}
                inputValue={watch('desiredLosses')}
                error={errors.desiredLosses?.message}
                keyboardType="number-pad"
                onChangeText={(value) => setValue('desiredLosses', value)}
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

function parseWholeNumberField(value?: string) {
  const sanitized = value?.trim() ?? '';

  if (!sanitized || !/^\d+$/.test(sanitized)) {
    return 0;
  }

  return Number(sanitized);
}

function parseDecimalField(value?: string) {
  const sanitized = (value?.trim() ?? '').replace(',', '.');

  if (!sanitized || Number.isNaN(Number(sanitized))) {
    return 0;
  }

  return Number(Number(sanitized).toFixed(2));
}

function formatAdjustment(value: number, digits = 0) {
  const normalized = formatStatNumber(value, digits);

  if (value > 0) {
    return `+${normalized}`;
  }

  return normalized;
}

function StatsCorrectionField({
  label,
  computedValue,
  adjustmentValue,
  inputValue,
  onChangeText,
  error,
  keyboardType,
  allowDecimal,
}: {
  label: string;
  computedValue: number;
  adjustmentValue: number;
  inputValue?: string;
  onChangeText: (value: string) => void;
  error?: string;
  keyboardType: 'number-pad' | 'decimal-pad';
  allowDecimal?: boolean;
}) {
  const theme = useAppTheme();
  const digits = allowDecimal ? 2 : 0;
  const adjustmentPositive = adjustmentValue > 0;
  const adjustmentNegative = adjustmentValue < 0;

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: theme.colors.backgroundElevated,
          borderColor: theme.colors.border,
        },
      ]}>
      <View style={styles.statHeader}>
        <Text style={[styles.statTitle, { color: theme.colors.text }]}>{label}</Text>
        <Text
          style={[
            styles.statAdjustment,
            {
              color: adjustmentPositive
                ? theme.colors.success
                : adjustmentNegative
                  ? theme.colors.warning
                  : theme.colors.textMuted,
            },
          ]}>
          Ajuste aplicado: {formatAdjustment(adjustmentValue, digits)}
        </Text>
      </View>
      <Text style={[styles.statMeta, { color: theme.colors.textMuted }]}>
        Calculado pelo app: {formatStatNumber(computedValue, digits)}
      </Text>
      <AppInput
        label="Total correto"
        keyboardType={keyboardType}
        value={inputValue ?? ''}
        onChangeText={onChangeText}
        error={error}
      />
    </View>
  );
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
  sectionHelper: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statsGrid: {
    gap: 12,
  },
  statCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  statHeader: {
    gap: 4,
  },
  statTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  statMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  statAdjustment: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
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

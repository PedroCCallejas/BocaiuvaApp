import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { TEAM_COLOR_PRESETS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManageTeam,
  selectCurrentTeam,
  selectCurrentUser,
} from '@/store/selectors';

const schema = z.object({
  name: z.string().min(3, 'Informe o nome do time.'),
  coachName: z.string().min(3, 'Informe o responsavel.'),
  slug: z.string().min(3, 'Informe um slug curto para o time.'),
  description: z.string().optional(),
  logoUrl: z.string().url('Informe uma URL valida.').or(z.literal('')).optional(),
  primaryColor: z.string().min(4),
  secondaryColor: z.string().min(4),
  accentColor: z.string().optional(),
});

type TeamSettingsValues = z.infer<typeof schema>;

export default function TeamSettingsScreen() {
  const theme = useAppTheme();
  const currentUser = useAppStore(selectCurrentUser);
  const team = useAppStore(selectCurrentTeam);
  const canManage = useAppStore(selectCanManageTeam);
  const updateTeam = useAppStore((state) => state.updateTeam);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TeamSettingsValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: team?.name ?? '',
      coachName: team?.coachName ?? currentUser?.displayName ?? '',
      slug: team?.slug ?? '',
      description: team?.description ?? '',
      logoUrl: team?.logoUrl ?? '',
      primaryColor: team?.primaryColor ?? TEAM_COLOR_PRESETS[0]?.primary ?? '#355067',
      secondaryColor: team?.secondaryColor ?? TEAM_COLOR_PRESETS[0]?.secondary ?? '#DCE5EE',
      accentColor: team?.accentColor ?? TEAM_COLOR_PRESETS[0]?.accent ?? '#8DB7D9',
    },
  });

  if (!team || !canManage) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Somente quem administra o time pode alterar essas configuracoes."
        />
      </Screen>
    );
  }

  const currentTeam = team;

  const previewTeam = {
    ...currentTeam,
    name: watch('name') || 'Seu time',
    slug: watch('slug') || currentTeam.slug,
    description: watch('description') ?? '',
    coachName: watch('coachName') || currentTeam.coachName,
    logoUrl: watch('logoUrl')?.trim() || null,
    primaryColor: watch('primaryColor'),
    secondaryColor: watch('secondaryColor'),
    accentColor: watch('accentColor')?.trim() || null,
  };

  async function onSubmit(values: TeamSettingsValues) {
    try {
      await updateTeam(currentTeam.id, {
        name: values.name,
        coachName: values.coachName,
        slug: values.slug,
        description: values.description?.trim() ?? '',
        logoUrl: values.logoUrl?.trim() || null,
        primaryColor: values.primaryColor,
        secondaryColor: values.secondaryColor,
        accentColor: values.accentColor?.trim() || null,
      });
      router.back();
    } catch (error) {
      Alert.alert(
        'Nao foi possivel salvar o time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Editar time</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Atualize nome, identidade visual e as informacoes que o elenco vai enxergar no app.
        </Text>
      </View>

      <TeamHeroCard team={previewTeam} modeLabel="Preview do time" />

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
          name="name"
          render={({ field }) => (
            <AppInput
              label="Nome do time"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.name?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="coachName"
          render={({ field }) => (
            <AppInput
              label="Tecnico / responsavel"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.coachName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="slug"
          render={({ field }) => (
            <AppInput
              label="Slug do time"
              autoCapitalize="none"
              autoCorrect={false}
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.slug?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <AppInput
              label="Descricao curta"
              multiline
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              style={styles.multiline}
            />
          )}
        />
        <Controller
          control={control}
          name="logoUrl"
          render={({ field }) => (
            <AppInput
              label="Escudo por URL (opcional)"
              autoCapitalize="none"
              autoCorrect={false}
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.logoUrl?.message}
            />
          )}
        />
        <Text style={[styles.paletteLabel, { color: theme.colors.textMuted }]}>
          Escolha a paleta do time
        </Text>
        <View style={styles.paletteGrid}>
          {TEAM_COLOR_PRESETS.map((preset) => {
            const selected =
              watch('primaryColor') === preset.primary &&
              watch('secondaryColor') === preset.secondary &&
              (watch('accentColor') ?? '') === (preset.accent ?? '');

            return (
              <Pressable
                key={preset.id}
                onPress={() => {
                  setValue('primaryColor', preset.primary);
                  setValue('secondaryColor', preset.secondary);
                  setValue('accentColor', preset.accent ?? '');
                }}
                style={[
                  styles.paletteCard,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                ]}>
                <View style={styles.paletteRow}>
                  <View style={[styles.swatch, { backgroundColor: preset.primary }]} />
                  <View style={[styles.swatch, { backgroundColor: preset.secondary }]} />
                  {preset.accent ? (
                    <View style={[styles.swatchSmall, { backgroundColor: preset.accent }]} />
                  ) : null}
                </View>
                <Text style={[styles.paletteName, { color: theme.colors.text }]}>{preset.name}</Text>
                <Text style={[styles.paletteDescription, { color: theme.colors.textMuted }]}>
                  {preset.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: 16,
  },
  paletteLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paletteCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  paletteRow: {
    flexDirection: 'row',
    gap: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  swatchSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignSelf: 'center',
  },
  paletteName: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  paletteDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
});

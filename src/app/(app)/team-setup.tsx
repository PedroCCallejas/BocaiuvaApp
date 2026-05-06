import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppInput } from '@/components/ui/AppInput';
import { Screen } from '@/components/ui/Screen';
import { TEAM_COLOR_PRESETS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import { selectCanCreateTeam, selectCurrentUser } from '@/store/selectors';

const schema = z.object({
  name: z.string().min(3, 'Informe o nome do time.'),
  coachName: z.string().min(3, 'Informe o responsavel.'),
  logoUrl: z.string().url('Informe uma URL valida.').or(z.literal('')).optional(),
  paletteId: z.string().min(1, 'Escolha uma paleta.'),
});

type TeamSetupValues = z.infer<typeof schema>;

export default function TeamSetupScreen() {
  const theme = useAppTheme();
  const currentUser = useAppStore(selectCurrentUser);
  const canCreateTeam = useAppStore(selectCanCreateTeam);
  const createTeam = useAppStore((state) => state.createTeam);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TeamSetupValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      coachName: currentUser?.displayName ?? 'Responsavel',
      logoUrl: '',
      paletteId: TEAM_COLOR_PRESETS[0]?.id ?? '',
    },
  });

  const selectedPaletteId = watch('paletteId');
  const selectedPalette =
    TEAM_COLOR_PRESETS.find((preset) => preset.id === selectedPaletteId) ??
    TEAM_COLOR_PRESETS[0];

  const previewTeam = {
    id: 'preview',
    name: watch('name') || 'Seu time',
    slug: 'preview',
    description: '',
    inviteCode: 'ABC123',
    inviteCodeUpdatedAt: '',
    logoUrl: watch('logoUrl')?.trim() || null,
    primaryColor: selectedPalette?.primary ?? '#355067',
    secondaryColor: selectedPalette?.secondary ?? '#DCE5EE',
    accentColor: selectedPalette?.accent ?? null,
    coachName: watch('coachName') || currentUser?.displayName || 'Responsavel',
    adminUserId: currentUser?.id ?? 'preview',
    activeSeasonId: null,
    createdAt: '',
    updatedAt: '',
  };

  if (!canCreateTeam) {
    return (
      <Screen>
        <EmptyState
          title="Criar time indisponivel"
          description="Seu acesso ainda nao permite criar um time."
          actionLabel="Voltar"
          onAction={() => router.replace('/team-access' as never)}
        />
      </Screen>
    );
  }

  async function onSubmit(values: TeamSetupValues) {
    const palette =
      TEAM_COLOR_PRESETS.find((preset) => preset.id === values.paletteId) ??
      TEAM_COLOR_PRESETS[0];

    try {
      await createTeam({
        name: values.name,
        coachName: values.coachName,
        logoUrl: values.logoUrl?.trim() || null,
        primaryColor: palette?.primary ?? '#355067',
        secondaryColor: palette?.secondary ?? '#DCE5EE',
        accentColor: palette?.accent ?? null,
      });
      router.replace('/home');
    } catch (error) {
      Alert.alert(
        'Nao foi possivel criar o time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Crie seu time</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Escolha o nome, defina quem comanda o grupo e selecione uma paleta para deixar tudo com a cara do seu elenco.
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
          {TEAM_COLOR_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => {
                setValue('paletteId', preset.id, { shouldDirty: true, shouldValidate: true });
              }}
              style={[
                styles.paletteCard,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor:
                    selectedPaletteId === preset.id ? theme.colors.primary : theme.colors.border,
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
          ))}
        </View>
        <AppButton
          label="Criar time e entrar"
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

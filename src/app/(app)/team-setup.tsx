import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
import { ImageUploadField } from '@/components/forms/ImageUploadField';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Screen } from '@/components/ui/Screen';
import { TEAM_COLOR_PRESETS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  MAX_OWNED_TEAMS_PER_ACCOUNT,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
} from '@/lib/team';
import {
  buildTeamLogoStoragePath,
  pickImage,
  uploadImage,
  type ImagePickerSource,
  type SelectedImageAsset,
} from '@/lib/uploadImage';
import { useAppStore } from '@/store/app-store';
import {
  selectCanCreateTeam,
  selectCurrentUser,
  selectOwnedTeamsCount,
} from '@/store/selectors';

const schema = z.object({
  name: z.string().min(3, 'Informe o nome do time.'),
  coachName: z.string().min(3, 'Informe o responsável.'),
  paletteId: z.string().min(1, 'Escolha uma paleta.'),
});

type TeamSetupValues = z.infer<typeof schema>;

export default function TeamSetupScreen() {
  const theme = useAppTheme();
  const currentUser = useAppStore(selectCurrentUser);
  const canCreateTeam = useAppStore(selectCanCreateTeam);
  const ownedTeamsCount = useAppStore(selectOwnedTeamsCount);
  const createTeam = useAppStore((state) => state.createTeam);
  const updateTeam = useAppStore((state) => state.updateTeam);
  const [pendingLogo, setPendingLogo] = useState<SelectedImageAsset | null>(null);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
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
      coachName: currentUser?.displayName ?? 'Responsável',
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
    logoUrl: pendingLogo?.uri ?? null,
    primaryColor: selectedPalette?.primary ?? '#355067',
    secondaryColor: selectedPalette?.secondary ?? '#DCE5EE',
    accentColor: selectedPalette?.accent ?? null,
    coachName: watch('coachName') || currentUser?.displayName || 'Responsável',
    adminUserId: currentUser?.id ?? 'preview',
    activeSeasonId: null,
    createdAt: '',
    updatedAt: '',
  };

  async function handlePickLogo(source: ImagePickerSource) {
    try {
      const asset = await pickImage(source);
      if (!asset) {
        return;
      }

      setPendingLogo(asset);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a imagem',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function onSubmit(values: TeamSetupValues) {
    if (!canCreateTeam) {
      Alert.alert('Limite atingido', OWNED_TEAMS_LIMIT_REACHED_MESSAGE);
      return;
    }

    const palette =
      TEAM_COLOR_PRESETS.find((preset) => preset.id === values.paletteId) ??
      TEAM_COLOR_PRESETS[0];

    try {
      const createdTeam = await createTeam({
        name: values.name,
        coachName: values.coachName,
        logoUrl: null,
        primaryColor: palette?.primary ?? '#355067',
        secondaryColor: palette?.secondary ?? '#DCE5EE',
        accentColor: palette?.accent ?? null,
      });

      if (pendingLogo) {
        try {
          setLogoUploadProgress(0);
          const uploadedLogo = await uploadImage({
            asset: pendingLogo,
            storagePath: buildTeamLogoStoragePath(createdTeam.id),
            onProgress: setLogoUploadProgress,
          });

          await updateTeam(createdTeam.id, {
            name: values.name,
            coachName: values.coachName,
            slug: createdTeam.slug,
            description: '',
            logoUrl: uploadedLogo.downloadUrl,
            primaryColor: palette?.primary ?? '#355067',
            secondaryColor: palette?.secondary ?? '#DCE5EE',
            accentColor: palette?.accent ?? null,
          });
        } catch (error) {
          Alert.alert(
            'Time criado sem escudo',
            error instanceof Error
              ? error.message
              : 'O time foi criado, mas o upload do escudo falhou.',
          );
        } finally {
          setLogoUploadProgress(null);
        }
      }

      router.replace('/home');
    } catch (error) {
      setLogoUploadProgress(null);
      Alert.alert(
        'Não foi possível criar o time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen formMode>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Crie seu time</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Escolha o nome, defina quem comanda o grupo e selecione uma paleta para deixar tudo com a cara do seu elenco.
        </Text>
        <Text style={[styles.limitText, { color: theme.colors.textMuted }]}>
          {canCreateTeam
            ? `Você já administra ${ownedTeamsCount} de ${MAX_OWNED_TEAMS_PER_ACCOUNT} time(s).`
            : 'Limite de 2 times atingido.'}
        </Text>
        {!canCreateTeam ? (
          <Text style={[styles.limitWarning, { color: theme.colors.warning }]}>
            Você já administra 2 times.
          </Text>
        ) : null}
      </View>

      <TeamHeroCard team={previewTeam} modeLabel="Prévia do time" compact />

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
              label="Técnico / responsável"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.coachName?.message}
            />
          )}
        />
        <ImageUploadField
          label="Escudo do time"
          hint="Escolha na galeria ou tire uma foto. O upload acontece quando o time for criado."
          pendingImage={pendingLogo}
          onPickFromLibrary={() => void handlePickLogo('library')}
          onPickFromCamera={() => void handlePickLogo('camera')}
          onClear={pendingLogo ? () => setPendingLogo(null) : undefined}
          clearLabel="Remover escudo"
          emptyLabel="Sem escudo"
          progress={logoUploadProgress}
          disabled={isSubmitting}
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
          disabled={!canCreateTeam}
          loading={isSubmitting}
          fullWidth
        />
        {!canCreateTeam ? (
          <AppButton
            label="Voltar"
            variant="ghost"
            onPress={() => router.replace('/team-access' as never)}
            fullWidth
          />
        ) : null}
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
  limitText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  limitWarning: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
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

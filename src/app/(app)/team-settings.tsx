import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
import { ImageUploadField } from '@/components/forms/ImageUploadField';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { TEAM_COLOR_PRESETS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  buildTeamLogoStoragePath,
  pickImage,
  uploadImage,
  type ImagePickerSource,
  type SelectedImageAsset,
} from '@/lib/uploadImage';
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
  const [pendingLogo, setPendingLogo] = useState<SelectedImageAsset | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);

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
  const currentLogoUrl = removeLogo ? null : currentTeam.logoUrl ?? null;

  const previewTeam = {
    ...currentTeam,
    name: watch('name') || 'Seu time',
    slug: watch('slug') || currentTeam.slug,
    description: watch('description') ?? '',
    coachName: watch('coachName') || currentTeam.coachName,
    logoUrl: pendingLogo?.uri ?? currentLogoUrl,
    primaryColor: watch('primaryColor'),
    secondaryColor: watch('secondaryColor'),
    accentColor: watch('accentColor')?.trim() || null,
  };

  async function handlePickLogo(source: ImagePickerSource) {
    try {
      const asset = await pickImage(source);
      if (!asset) {
        return;
      }

      setPendingLogo(asset);
      setRemoveLogo(false);
    } catch (error) {
      Alert.alert(
        'Nao foi possivel abrir a imagem',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleClearLogo() {
    if (pendingLogo) {
      setPendingLogo(null);
      return;
    }

    setRemoveLogo(true);
  }

  async function onSubmit(values: TeamSettingsValues) {
    try {
      await updateTeam(currentTeam.id, {
        name: values.name,
        coachName: values.coachName,
        slug: values.slug,
        description: values.description?.trim() ?? '',
        logoUrl: pendingLogo ? currentTeam.logoUrl ?? null : currentLogoUrl,
        primaryColor: values.primaryColor,
        secondaryColor: values.secondaryColor,
        accentColor: values.accentColor?.trim() || null,
      });

      if (pendingLogo) {
        try {
          setLogoUploadProgress(0);
          const uploadedLogo = await uploadImage({
            asset: pendingLogo,
            storagePath: buildTeamLogoStoragePath(currentTeam.id),
            onProgress: setLogoUploadProgress,
          });

          await updateTeam(currentTeam.id, {
            name: values.name,
            coachName: values.coachName,
            slug: values.slug,
            description: values.description?.trim() ?? '',
            logoUrl: uploadedLogo.downloadUrl,
            primaryColor: values.primaryColor,
            secondaryColor: values.secondaryColor,
            accentColor: values.accentColor?.trim() || null,
          });
        } catch (error) {
          Alert.alert(
            'Alteracoes salvas sem trocar o escudo',
            error instanceof Error
              ? error.message
              : 'O restante das alteracoes foi salvo, mas o upload do escudo falhou.',
          );
        } finally {
          setLogoUploadProgress(null);
        }
      }

      router.back();
    } catch (error) {
      setLogoUploadProgress(null);
      Alert.alert(
        'Nao foi possivel salvar o time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen formMode>
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
        <ImageUploadField
          label="Escudo do time"
          hint="Escolha uma imagem para substituir o escudo atual do time."
          imageUrl={currentLogoUrl}
          pendingImage={pendingLogo}
          onPickFromLibrary={() => void handlePickLogo('library')}
          onPickFromCamera={() => void handlePickLogo('camera')}
          onClear={currentLogoUrl || pendingLogo ? handleClearLogo : undefined}
          clearLabel={
            pendingLogo
              ? currentLogoUrl
                ? 'Cancelar novo escudo'
                : 'Remover escudo'
              : 'Remover escudo'
          }
          emptyLabel="Sem escudo"
          progress={logoUploadProgress}
          disabled={isSubmitting}
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
        <View
          style={[
            styles.secondaryCard,
            {
              backgroundColor: theme.colors.backgroundElevated,
              borderColor: theme.colors.border,
            },
          ]}>
          <Text style={[styles.secondaryTitle, { color: theme.colors.text }]}>
            Criterios de avaliacao
          </Text>
          <Text style={[styles.secondaryText, { color: theme.colors.textMuted }]}>
            Defina quais notas o elenco usa para avaliar os jogadores do time.
          </Text>
          <AppButton
            label="Gerenciar criterios"
            variant="secondary"
            onPress={() => router.push('/team-rating-criteria' as never)}
          />
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
  secondaryCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  secondaryTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
});

import { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
import { ImageUploadField } from '@/components/forms/ImageUploadField';
import { VideoUploadField } from '@/components/forms/VideoUploadField';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { TEAM_COLOR_PRESETS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  buildTeamBannerStoragePath,
  buildTeamLogoStoragePath,
  pickImage,
  uploadImage,
  type ImagePickerSource,
  type SelectedImageAsset,
} from '@/lib/uploadImage';
import {
  buildTeamPresentationVideoStoragePath,
  pickVideo,
  uploadVideo,
  type SelectedVideoAsset,
} from '@/lib/uploadVideo';
import {
  TEAM_DELETION_SUCCESS_MESSAGE,
  TEAM_STORAGE_CLEANUP_WARNING_MESSAGE,
} from '@/lib/team-deletion';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManageTeam,
  selectCurrentTeam,
  selectCurrentUser,
} from '@/store/selectors';

const schema = z
  .object({
    name: z.string().min(3, 'Informe o nome do time.'),
    coachName: z.string().min(3, 'Informe o responsável.'),
    slug: z.string().min(3, 'Informe um slug curto para o time.'),
    description: z.string().optional(),
    primaryColor: z.string().min(4),
    secondaryColor: z.string().min(4),
    accentColor: z.string().optional(),
    isPublic: z.boolean(),
    city: z.string().optional(),
    state: z.string().optional(),
    neighborhood: z.string().optional(),
    homeFieldName: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactWhatsapp: z.string().optional(),
    allowFriendlyContact: z.boolean(),
    publicRosterEnabled: z.boolean(),
    publicDescription: z.string().optional(),
  })
  .superRefine((values, context) => {
    if (values.isPublic && !values.city?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe a cidade para aparecer na galeria.',
        path: ['city'],
      });
    }

    if (values.isPublic && !values.state?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o estado para aparecer na galeria.',
        path: ['state'],
      });
    }

    if (
      values.allowFriendlyContact &&
      !values.contactPhone?.trim() &&
      !values.contactWhatsapp?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe um telefone ou WhatsApp para liberar contato.',
        path: ['contactWhatsapp'],
      });
    }
  });

type TeamSettingsValues = z.infer<typeof schema>;

export default function TeamSettingsScreen() {
  const isWeb = Platform.OS === 'web';
  const theme = useAppTheme();
  const currentUser = useAppStore(selectCurrentUser);
  const team = useAppStore(selectCurrentTeam);
  const canManage = useAppStore(selectCanManageTeam);
  const updateTeam = useAppStore((state) => state.updateTeam);
  const deleteTeamPermanently = useAppStore((state) => state.deleteTeamPermanently);
  const [pendingLogo, setPendingLogo] = useState<SelectedImageAsset | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [pendingBanner, setPendingBanner] = useState<SelectedImageAsset | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [bannerUploadProgress, setBannerUploadProgress] = useState<number | null>(null);
  const [pendingPresentationVideo, setPendingPresentationVideo] =
    useState<SelectedVideoAsset | null>(null);
  const [removePresentationVideo, setRemovePresentationVideo] = useState(false);
  const [presentationVideoUploadProgress, setPresentationVideoUploadProgress] =
    useState<number | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTeamNameInput, setDeleteTeamNameInput] = useState('');
  const [deleteConfirmationChecked, setDeleteConfirmationChecked] = useState(false);
  const [deleteConfirmationTouched, setDeleteConfirmationTouched] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

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
      isPublic: team?.isPublic ?? false,
      city: team?.city ?? '',
      state: team?.state ?? '',
      neighborhood: team?.neighborhood ?? '',
      homeFieldName: team?.homeFieldName ?? '',
      contactName: team?.contactName ?? '',
      contactPhone: team?.contactPhone ?? '',
      contactWhatsapp: team?.contactWhatsapp ?? '',
      allowFriendlyContact: team?.allowFriendlyContact ?? false,
      publicRosterEnabled: team?.publicRosterEnabled ?? false,
      publicDescription: team?.publicDescription ?? '',
    },
  });

  if (!team || !canManage) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Somente quem administra o time pode alterar essas configurações."
        />
      </Screen>
    );
  }

  const currentTeam = team;
  const isTeamOwner = currentUser?.id === currentTeam.adminUserId;
  const currentLogoUrl = removeLogo ? null : currentTeam.logoUrl ?? null;
  const currentBannerUrl = removeBanner ? null : currentTeam.bannerUrl ?? null;
  const currentPresentationVideoUrl = removePresentationVideo
    ? null
    : currentTeam.presentationVideoUrl ?? null;

  const previewTeam = {
    ...currentTeam,
    name: watch('name') || 'Seu time',
    slug: watch('slug') || currentTeam.slug,
    description: watch('description') ?? '',
    coachName: watch('coachName') || currentTeam.coachName,
    logoUrl: pendingLogo?.uri ?? currentLogoUrl,
    bannerUrl: pendingBanner?.uri ?? currentBannerUrl,
    primaryColor: watch('primaryColor'),
    secondaryColor: watch('secondaryColor'),
    accentColor: watch('accentColor')?.trim() || null,
  };
  const deleteNameMatches = deleteTeamNameInput.trim() === currentTeam.name;
  const canConfirmPermanentDeletion =
    isTeamOwner && deleteNameMatches && deleteConfirmationChecked && !isDeletingTeam;

  function resetDeleteConfirmation() {
    setDeleteTeamNameInput('');
    setDeleteConfirmationChecked(false);
    setDeleteConfirmationTouched(false);
    setIsDeletingTeam(false);
  }

  function closeDeleteModal() {
    if (isDeletingTeam) {
      return;
    }

    setDeleteModalVisible(false);
    resetDeleteConfirmation();
  }

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
        'Não foi possível abrir a imagem',
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

  async function handlePickBanner(source: ImagePickerSource) {
    try {
      const asset = await pickImage(source);
      if (!asset) {
        return;
      }

      setPendingBanner(asset);
      setRemoveBanner(false);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a imagem',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleClearBanner() {
    if (pendingBanner) {
      setPendingBanner(null);
      return;
    }

    setRemoveBanner(true);
  }

  async function handlePickPresentationVideo() {
    try {
      const asset = await pickVideo();
      if (!asset) {
        return;
      }

      setPendingPresentationVideo(asset);
      setRemovePresentationVideo(false);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir o vídeo',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleClearPresentationVideo() {
    if (pendingPresentationVideo) {
      setPendingPresentationVideo(null);
      return;
    }

    setRemovePresentationVideo(true);
  }

  async function onSubmit(values: TeamSettingsValues) {
    try {
      let resolvedLogoUrl = pendingLogo ? currentTeam.logoUrl ?? null : currentLogoUrl;
      let resolvedBannerUrl = pendingBanner ? currentTeam.bannerUrl ?? null : currentBannerUrl;
      let resolvedPresentationVideoUrl = pendingPresentationVideo
        ? currentTeam.presentationVideoUrl ?? null
        : currentPresentationVideoUrl;

      const buildPayload = (
        logoUrl: string | null,
        bannerUrl: string | null,
        presentationVideoUrl: string | null,
      ) => ({
        name: values.name,
        coachName: values.coachName,
        slug: values.slug,
        description: values.description?.trim() ?? '',
        logoUrl,
        bannerUrl,
        presentationVideoUrl,
        primaryColor: values.primaryColor,
        secondaryColor: values.secondaryColor,
        accentColor: values.accentColor?.trim() || null,
        isPublic: values.isPublic,
        city: values.city?.trim() || null,
        state: values.state?.trim().toUpperCase() || null,
        neighborhood: values.neighborhood?.trim() || null,
        homeFieldName: values.homeFieldName?.trim() || null,
        contactName: values.contactName?.trim() || null,
        contactPhone: values.contactPhone?.trim() || null,
        contactWhatsapp: values.contactWhatsapp?.trim() || null,
        allowFriendlyContact: values.allowFriendlyContact,
        publicRosterEnabled: values.publicRosterEnabled,
        publicDescription: values.publicDescription?.trim() || null,
      });

      await updateTeam(
        currentTeam.id,
        buildPayload(resolvedLogoUrl, resolvedBannerUrl, resolvedPresentationVideoUrl),
      );

      if (pendingLogo) {
        try {
          setLogoUploadProgress(0);
          const uploadedLogo = await uploadImage({
            asset: pendingLogo,
            storagePath: buildTeamLogoStoragePath(currentTeam.id),
            onProgress: setLogoUploadProgress,
          });
          resolvedLogoUrl = uploadedLogo.downloadUrl;

          await updateTeam(
            currentTeam.id,
            buildPayload(resolvedLogoUrl, resolvedBannerUrl, resolvedPresentationVideoUrl),
          );
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

      if (pendingBanner) {
        try {
          setBannerUploadProgress(0);
          const uploadedBanner = await uploadImage({
            asset: pendingBanner,
            storagePath: buildTeamBannerStoragePath(currentTeam.id),
            onProgress: setBannerUploadProgress,
          });
          resolvedBannerUrl = uploadedBanner.downloadUrl;

          await updateTeam(
            currentTeam.id,
            buildPayload(resolvedLogoUrl, resolvedBannerUrl, resolvedPresentationVideoUrl),
          );
        } catch (error) {
          Alert.alert(
            'Alteracoes salvas sem trocar o banner',
            error instanceof Error
              ? error.message
              : 'O restante das alteracoes foi salvo, mas o upload do banner falhou.',
          );
        } finally {
          setBannerUploadProgress(null);
        }
      }

      if (pendingPresentationVideo) {
        try {
          setPresentationVideoUploadProgress(0);
          const uploadedVideo = await uploadVideo({
            asset: pendingPresentationVideo,
            storagePath: buildTeamPresentationVideoStoragePath(currentTeam.id),
            onProgress: setPresentationVideoUploadProgress,
          });
          resolvedPresentationVideoUrl = uploadedVideo.downloadUrl;

          await updateTeam(
            currentTeam.id,
            buildPayload(resolvedLogoUrl, resolvedBannerUrl, resolvedPresentationVideoUrl),
          );
        } catch (error) {
          Alert.alert(
            'Alteracoes salvas sem trocar o video',
            error instanceof Error
              ? error.message
              : 'O restante das alteracoes foi salvo, mas o upload do video falhou.',
          );
        } finally {
          setPresentationVideoUploadProgress(null);
        }
      }

      router.back();
    } catch (error) {
      setLogoUploadProgress(null);
      setBannerUploadProgress(null);
      setPresentationVideoUploadProgress(null);
      Alert.alert(
        'Não foi possível salvar o time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function handleDeleteTeam() {
    setDeleteConfirmationTouched(true);

    if (!canConfirmPermanentDeletion) {
      return;
    }

    try {
      setIsDeletingTeam(true);
      const result = await deleteTeamPermanently(currentTeam.id);
      const successMessage = result.storageCleanupWarning
        ? TEAM_STORAGE_CLEANUP_WARNING_MESSAGE
        : TEAM_DELETION_SUCCESS_MESSAGE;

      setDeleteModalVisible(false);
      resetDeleteConfirmation();
      Alert.alert('Exclusão concluída', successMessage, [
        {
          text: 'OK',
          onPress: () => router.replace('/team-access' as never),
        },
      ]);
    } catch (error) {
      setIsDeletingTeam(false);
      Alert.alert(
        'Não foi possível excluir o time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen formMode>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {isWeb ? 'Identidade e perfil público' : 'Editar time'}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Ajuste a identidade do elenco e o perfil que outros times vao enxergar ao buscar amistosos.
        </Text>
      </View>

      <TeamHeroCard team={previewTeam} modeLabel="Como o time aparece" compact />

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
        <Controller
          control={control}
          name="slug"
          render={({ field }) => (
            <AppInput
              label="Nome curto do time"
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
              label="Descrição interna do time"
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
        <ImageUploadField
          label="Banner do time"
          hint="Essa faixa aparece em destaque no perfil público do time."
          imageUrl={currentBannerUrl}
          pendingImage={pendingBanner}
          onPickFromLibrary={() => void handlePickBanner('library')}
          onPickFromCamera={() => void handlePickBanner('camera')}
          onClear={currentBannerUrl || pendingBanner ? handleClearBanner : undefined}
          clearLabel={
            pendingBanner
              ? currentBannerUrl
                ? 'Cancelar novo banner'
                : 'Remover banner'
              : 'Remover banner'
          }
          emptyLabel="Sem banner"
          progress={bannerUploadProgress}
          disabled={isSubmitting}
        />
        <VideoUploadField
          label="Vídeo de apresentação do time"
          hint="Envie um vídeo curto em MP4 para aparecer no perfil público do time."
          videoUrl={currentPresentationVideoUrl}
          pendingVideo={pendingPresentationVideo}
          onPickFromLibrary={() => void handlePickPresentationVideo()}
          onClear={
            currentPresentationVideoUrl || pendingPresentationVideo
              ? handleClearPresentationVideo
              : undefined
          }
          clearLabel={
            pendingPresentationVideo
              ? currentPresentationVideoUrl
                ? 'Cancelar novo vídeo'
                : 'Remover vídeo'
              : 'Remover vídeo'
          }
          emptyLabel="Sem vídeo de apresentação"
          progress={presentationVideoUploadProgress}
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
                <Text style={[styles.paletteName, { color: theme.colors.text }]}>
                  {preset.name}
                </Text>
                <Text style={[styles.paletteDescription, { color: theme.colors.textMuted }]}>
                  {preset.description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={[
            styles.publicCard,
            {
              backgroundColor: theme.colors.backgroundElevated,
              borderColor: theme.colors.border,
            },
          ]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Perfil público do time
          </Text>
          <Text style={[styles.sectionText, { color: theme.colors.textMuted }]}>
            Outros times poderão encontrar seu time e chamar para amistoso.
          </Text>
          <Text style={[styles.helperNote, { color: theme.colors.textMuted }]}>
            Dados internos como notas, presença e estatísticas individuais não serão exibidos.
          </Text>

          <Controller
            control={control}
            name="isPublic"
            render={({ field }) => (
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
                    Aparecer na galeria de times?
                  </Text>
                  <Text style={[styles.toggleHelper, { color: theme.colors.textMuted }]}>
                    Mostra o escudo, localização básica e números agregados do time.
                  </Text>
                </View>
                <Switch value={field.value} onValueChange={field.onChange} />
              </View>
            )}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Controller
                control={control}
                name="city"
                render={({ field }) => (
                  <AppInput
                    label="Cidade"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.city?.message}
                  />
                )}
              />
            </View>
            <View style={styles.ufField}>
              <Controller
                control={control}
                name="state"
                render={({ field }) => (
                  <AppInput
                    label="Estado"
                    autoCapitalize="characters"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChangeText={(value) => field.onChange(value.toUpperCase())}
                    error={errors.state?.message}
                  />
                )}
              />
            </View>
          </View>

          <Controller
            control={control}
            name="neighborhood"
            render={({ field }) => (
              <AppInput
                label="Bairro opcional"
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="homeFieldName"
            render={({ field }) => (
              <AppInput
                label="Campo principal opcional"
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="contactName"
            render={({ field }) => (
              <AppInput
                label="Nome para contato"
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
              />
            )}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Controller
                control={control}
                name="contactPhone"
                render={({ field }) => (
                  <AppInput
                    label="Telefone"
                    keyboardType="phone-pad"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.contactPhone?.message}
                  />
                )}
              />
            </View>
            <View style={styles.half}>
              <Controller
                control={control}
                name="contactWhatsapp"
                render={({ field }) => (
                  <AppInput
                    label="WhatsApp"
                    keyboardType="phone-pad"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    error={errors.contactWhatsapp?.message}
                  />
                )}
              />
            </View>
          </View>

          <Controller
            control={control}
            name="allowFriendlyContact"
            render={({ field }) => (
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
                    Permitir contato para amistoso?
                  </Text>
                  <Text style={[styles.toggleHelper, { color: theme.colors.textMuted }]}>
                    O contato público aparece só quando essa chave estiver ligada.
                  </Text>
                </View>
                <Switch value={field.value} onValueChange={field.onChange} />
              </View>
            )}
          />

          <Controller
            control={control}
            name="publicRosterEnabled"
            render={({ field }) => (
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
                    Mostrar elenco publicamente?
                  </Text>
                  <Text style={[styles.toggleHelper, { color: theme.colors.textMuted }]}>
                    Exibe apenas foto, apelido, posição e número da camisa.
                  </Text>
                </View>
                <Switch value={field.value} onValueChange={field.onChange} />
              </View>
            )}
          />

          <Controller
            control={control}
            name="publicDescription"
            render={({ field }) => (
              <AppInput
                label="Descrição pública do time"
                multiline
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                style={styles.multiline}
              />
            )}
          />
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
            Critérios de avaliação
          </Text>
          <Text style={[styles.secondaryText, { color: theme.colors.textMuted }]}>
            Escolha os pontos que o elenco usa para avaliar cada jogador nas partidas.
          </Text>
          <AppButton
            label="Ajustar critérios"
            variant="secondary"
            onPress={() => router.push('/team-rating-criteria' as never)}
          />
        </View>

        <AppButton
          label="Salvar alterações"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          fullWidth
        />
        {isTeamOwner ? (
          <View
            style={[
              styles.dangerCard,
              {
                backgroundColor: `${theme.colors.danger}12`,
                borderColor: `${theme.colors.danger}55`,
              },
            ]}>
            <Text style={[styles.dangerTitle, { color: theme.colors.danger }]}>
              Zona de perigo
            </Text>
            <Text style={[styles.dangerText, { color: theme.colors.textMuted }]}>
              Esta ação apagará o time e todos os dados relacionados: jogadores, partidas,
              presença, escalações, notas, MVPs, diário, notificações e configurações.
            </Text>
            <AppButton
              label="Excluir time definitivamente"
              variant="danger"
              onPress={() => setDeleteModalVisible(true)}
              disabled={isSubmitting || isDeletingTeam}
              fullWidth
            />
          </View>
        ) : null}
      </View>
      <Modal
        visible={deleteModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeDeleteModal}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: `${theme.colors.danger}55`,
              },
            ]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Excluir time definitivamente
            </Text>
            <Text style={[styles.modalText, { color: theme.colors.textMuted }]}>
              Digite exatamente o nome do time para confirmar a exclusão irreversível.
            </Text>
            <Text style={[styles.modalHighlight, { color: theme.colors.danger }]}>
              {currentTeam.name}
            </Text>

            <AppInput
              label="Nome do time"
              value={deleteTeamNameInput}
              onChangeText={setDeleteTeamNameInput}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isDeletingTeam}
              error={
                deleteConfirmationTouched && !deleteNameMatches
                  ? 'Digite exatamente o nome do time.'
                  : undefined
              }
            />

            <Pressable
              onPress={() => {
                if (isDeletingTeam) {
                  return;
                }

                setDeleteConfirmationTouched(true);
                setDeleteConfirmationChecked((value) => !value);
              }}
              style={[
                styles.checkboxRow,
                {
                  borderColor:
                    deleteConfirmationTouched && !deleteConfirmationChecked
                      ? theme.colors.danger
                      : theme.colors.border,
                  backgroundColor: theme.colors.backgroundElevated,
                },
              ]}>
              <View
                style={[
                  styles.checkboxBox,
                  {
                    borderColor: deleteConfirmationChecked
                      ? theme.colors.danger
                      : theme.colors.border,
                    backgroundColor: deleteConfirmationChecked
                      ? `${theme.colors.danger}20`
                      : 'transparent',
                  },
                ]}>
                <Text style={[styles.checkboxCheck, { color: theme.colors.danger }]}>
                  {deleteConfirmationChecked ? '✓' : ''}
                </Text>
              </View>
              <Text style={[styles.checkboxLabel, { color: theme.colors.text }]}>
                Entendo que esta ação não poderá ser desfeita.
              </Text>
            </Pressable>

            {deleteConfirmationTouched && !deleteConfirmationChecked ? (
              <Text style={[styles.confirmationError, { color: theme.colors.danger }]}>
                Marque a confirmação para continuar.
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <AppButton
                label="Cancelar"
                variant="secondary"
                onPress={closeDeleteModal}
                disabled={isDeletingTeam}
                fullWidth
              />
              <AppButton
                label="Excluir definitivamente"
                variant="danger"
                onPress={() => void handleDeleteTeam()}
                disabled={!canConfirmPermanentDeletion}
                loading={isDeletingTeam}
                fullWidth
              />
            </View>
          </View>
        </View>
      </Modal>
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
  publicCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  helperNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  half: {
    flex: 1,
    minWidth: 160,
  },
  ufField: {
    width: 110,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  toggleHelper: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
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
  dangerCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 12,
  },
  dangerTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  dangerText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 18, 0.72)',
    padding: 20,
    justifyContent: 'center',
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
  },
  modalText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  modalHighlight: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCheck: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  confirmationError: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  modalActions: {
    gap: 10,
  },
});

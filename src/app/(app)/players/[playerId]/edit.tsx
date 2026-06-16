import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PlayerForm } from '@/components/forms/PlayerForm';
import { VideoUploadField } from '@/components/forms/VideoUploadField';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { isPlayerInactive } from '@/lib/player-management';
import {
  getOwnPlayerProfileBlockedMessage,
  logOwnPlayerProfileAccess,
  pickSelfPlayerProfileEditableInput,
  resolveOwnPlayerProfileAccess,
} from '@/lib/player-profile-access';
import {
  getProfilePhotoSaveErrorMessage,
  getProfilePhotoUploadErrorMessage,
  isPermissionDeniedError,
} from '@/lib/profile-photo-errors';
import { getPlayerComputedStats } from '@/lib/stats';
import { buildPlayerPhotoStoragePath, uploadImage } from '@/lib/uploadImage';
import {
  buildPlayerPresentationVideoStoragePath,
  pickVideo,
  uploadVideo,
  type SelectedVideoAsset,
} from '@/lib/uploadVideo';
import { useAppStore } from '@/store/app-store';
import {
  findPlayerById,
  selectCanManagePlayers,
  selectCanManageTeam,
  selectCurrentMembership,
  selectCurrentTeam,
  selectCurrentUser,
} from '@/store/selectors';

type ErrorWithCode = Error & { code?: string };

function getErrorDebugInfo(error: unknown) {
  if (error instanceof Error) {
    return {
      code: (error as ErrorWithCode).code ?? null,
      message: error.message,
    };
  }

  return {
    code: null,
    message: String(error),
  };
}

function getPlayerProfileSaveErrorMessage(error: unknown) {
  if (isPermissionDeniedError(error)) {
    return 'Sua conta não tem permissão para salvar este perfil. Confirme se o membership ativo está vinculado ao seu jogador ou peça ao admin para revisar o vínculo.';
  }

  return error instanceof Error ? error.message : 'Tente novamente.';
}

function buildPlayerEditAuditPayload(input: {
  routePlayerId: string;
  teamId: string;
  currentUser: ReturnType<typeof selectCurrentUser>;
  currentMembership: ReturnType<typeof selectCurrentMembership>;
  editablePlayer: ReturnType<typeof findPlayerById>;
  ownProfileAccess: ReturnType<typeof resolveOwnPlayerProfileAccess>;
  canEditProfile: boolean;
  canManagePlayers: boolean;
}) {
  return {
    uid: input.currentUser?.id ?? null,
    teamId: input.teamId,
    routePlayerId: input.routePlayerId,
    playerId: input.editablePlayer?.id ?? null,
    membershipPlayerId: input.currentMembership?.playerId ?? null,
    membershipIndexPlayerId: input.currentMembership?.playerId ?? null,
    membershipIndexSource: 'client-membership-mirror',
    linkedUserId: input.editablePlayer?.linkedUserId ?? null,
    linkedEmail: input.editablePlayer?.linkedEmail ?? null,
    userEmail: input.currentUser?.email ?? null,
    canEditOwnPlayerProfile: input.ownProfileAccess.allowed,
    canManagePlayers: input.canManagePlayers,
    blockReason: input.canEditProfile ? null : input.ownProfileAccess.reason,
    diagnostics: input.ownProfileAccess.diagnostics,
  };
}

export default function EditPlayerScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const currentUser = useAppStore(selectCurrentUser);
  const currentMembership = useAppStore(selectCurrentMembership);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const player = useAppStore((state) => findPlayerById(state, String(playerId)));
  const updatePlayer = useAppStore((state) => state.updatePlayer);
  const unlinkPlayerAccount = useAppStore((state) => state.unlinkPlayerAccount);
  const removePlayer = useAppStore((state) => state.removePlayer);
  const reactivatePlayer = useAppStore((state) => state.reactivatePlayer);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [pendingPresentationVideo, setPendingPresentationVideo] =
    useState<SelectedVideoAsset | null>(null);
  const [removePresentationVideo, setRemovePresentationVideo] = useState(false);
  const [presentationVideoUploadProgress, setPresentationVideoUploadProgress] =
    useState<number | null>(null);

  if (!team || !player) {
    return (
      <Screen>
        <EmptyState
          title="Jogador não encontrado"
          description="O cadastro que você tentou abrir não existe mais."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const editablePlayer = player;
  const ownProfileAccess = useMemo(
    () =>
      resolveOwnPlayerProfileAccess({
        teamId: editablePlayer.teamId,
        user: currentUser,
        membership: currentMembership,
        player: editablePlayer,
        teamPlayers: snapshot.players,
      }),
    [currentMembership, currentUser, editablePlayer, snapshot.players],
  );
  const canEditProfile = canManagePlayers || ownProfileAccess.allowed;
  const variant = canManagePlayers ? 'admin' : canEditProfile ? 'self' : null;
  const canManageLifecycle = variant === 'admin' && canManageTeam;
  const canManageAccountLink = canManageLifecycle;
  const canManagePresentationVideo = variant === 'admin' && canManageTeam;
  const currentPresentationVideoUrl = removePresentationVideo
    ? null
    : editablePlayer.presentationVideoUrl ?? null;
  const computedStats = useMemo(
    () => getPlayerComputedStats(snapshot, editablePlayer.teamId, editablePlayer.id),
    [editablePlayer.id, editablePlayer.teamId, snapshot],
  );

  useEffect(() => {
    if (canManagePlayers || ownProfileAccess.allowed) {
      return;
    }

    logOwnPlayerProfileAccess(
      'edit-player-screen',
      {
        teamId: editablePlayer.teamId,
        user: currentUser,
        membership: currentMembership,
        player: editablePlayer,
      },
      ownProfileAccess,
    );
  }, [
    canManagePlayers,
    currentMembership,
    currentUser,
    editablePlayer,
    ownProfileAccess,
  ]);

  const blockedDescription = getOwnPlayerProfileBlockedMessage(ownProfileAccess);

  if (!variant) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description={blockedDescription}
          actionLabel="Voltar ao perfil"
          onAction={() => router.replace(`/players/${editablePlayer.id}`)}
        />
      </Screen>
    );
  }

  function handleUnlinkAccount() {
    Alert.alert(
      'Desvincular conta',
      'Essa ação remove a ligação entre este jogador e a conta atual. O histórico do jogador será preservado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular conta',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await unlinkPlayerAccount(editablePlayer.id);
                Alert.alert('Conta desvinculada', 'O jogador agora está sem conta vinculada.');
              } catch (error) {
                Alert.alert(
                  'Não foi possível desvincular',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
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

  function handleInactivatePlayer() {
    Alert.alert(
      'Inativar jogador',
      editablePlayer.linkedUserId
        ? 'Este jogador não aparecerá como ativo no elenco, mas o histórico será preservado. Se houver conta vinculada, o acesso como jogador sai do elenco ativo; administradores continuam com a gestão.'
        : 'Este jogador não aparecerá como ativo no elenco, mas o histórico será preservado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Inativar jogador',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                if (__DEV__) {
                  console.log('[player-edit] inactivate pressed', {
                    playerId: editablePlayer.id,
                    uid: currentUser?.id ?? null,
                    teamId: editablePlayer.teamId,
                    canManageTeam,
                  });
                }
                await removePlayer(editablePlayer.id);
                router.replace('/players');
              } catch (error) {
                Alert.alert(
                  'Não foi possível inativar',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  function handleReactivatePlayer() {
    Alert.alert(
      'Reativar jogador',
      'Esse cadastro volta ao elenco ativo, preserva o histórico e entra novamente nas partidas abertas do time.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reativar jogador',
          onPress: () => {
            void (async () => {
              try {
                if (__DEV__) {
                  console.log('[player-edit] reactivate pressed', {
                    playerId: editablePlayer.id,
                    uid: currentUser?.id ?? null,
                    teamId: editablePlayer.teamId,
                    canManageTeam,
                  });
                }
                await reactivatePlayer(editablePlayer.id);
                Alert.alert('Jogador reativado', 'O cadastro voltou ao elenco ativo.');
              } catch (error) {
                Alert.alert(
                  'Não foi possível reativar',
                  error instanceof Error ? error.message : 'Tente novamente.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <Screen formMode>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {variant === 'admin' ? 'Editar jogador' : 'Editar meu perfil'}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {variant === 'admin'
            ? 'Atualize dados esportivos, correções de estatísticas, conta conectada e histórico do atleta.'
            : 'Ajuste os dados pessoais liberados para o seu perfil dentro do time.'}
        </Text>
      </View>

      {variant === 'self' ? (
        <SectionHeader
          title={`${editablePlayer.nickname} - camisa ${editablePlayer.jerseyNumber}`}
          subtitle={editablePlayer.fullName}
        />
      ) : null}

      {canManageAccountLink &&
      (editablePlayer.linkedUserId || editablePlayer.linkedEmail) ? (
        <AppButton
          label="Desvincular conta deste jogador"
          variant="ghost"
          onPress={handleUnlinkAccount}
        />
      ) : null}

      {canManageLifecycle && !isPlayerInactive(editablePlayer) ? (
        <AppButton label="Inativar jogador" variant="danger" onPress={handleInactivatePlayer} />
      ) : null}

      {canManageLifecycle && isPlayerInactive(editablePlayer) ? (
        <AppButton label="Reativar jogador" onPress={handleReactivatePlayer} />
      ) : null}

      {canManagePresentationVideo ? (
        <VideoUploadField
          label="Vídeo de apresentação do jogador"
          hint="Envie um vídeo curto em MP4 para destacar o atleta no perfil."
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
          disabled={photoUploadProgress != null || presentationVideoUploadProgress != null}
        />
      ) : null}

      <PlayerForm
        variant={variant}
        submitLabel="Salvar alterações"
        allowStatusEdit={canManageLifecycle}
        allowLinkedEmailEdit={canManageAccountLink}
        imageUploadProgress={photoUploadProgress}
        computedStats={variant === 'admin' ? computedStats : undefined}
        helperText={
          variant === 'self'
            ? 'Você pode ajustar foto, apelido, bio, posições, pé dominante, camisa quando liberada e links públicos de vídeo. Os dados administrativos continuam sob controle de quem gerencia o elenco.'
            : editablePlayer.linkedUserId
              ? `Conta conectada: ${editablePlayer.linkedEmail ?? 'ativa'}`
              : 'Se você preencher um e-mail, essa conta pode ser vinculada automaticamente quando o jogador entrar com o código do time.'
        }
        defaults={{
          fullName: editablePlayer.fullName,
          nickname: editablePlayer.nickname,
          photoUrl: editablePlayer.photoUrl ?? '',
          jerseyNumber: editablePlayer.jerseyNumber,
          primaryPosition: editablePlayer.primaryPosition,
          secondaryPositions: editablePlayer.secondaryPositions,
          dominantFoot: editablePlayer.dominantFoot,
          status: editablePlayer.status,
          linkedEmail: editablePlayer.linkedEmail ?? '',
          bio: editablePlayer.bio ?? '',
          preferredPosition: editablePlayer.preferredPosition ?? null,
          introVideoUrl:
            editablePlayer.introVideoUrl ?? editablePlayer.presentationVideoUrl ?? '',
          celebrationVideoUrl: editablePlayer.celebrationVideoUrl ?? '',
          allowSelfEditJerseyNumber: editablePlayer.allowSelfEditJerseyNumber ?? false,
          manualStats: editablePlayer.manualStats,
        }}
        onSubmitPress={() => {
          if (__DEV__) {
            console.log(
              '[player-edit] save button pressed',
              buildPlayerEditAuditPayload({
                routePlayerId: String(playerId),
                teamId: team.id,
                currentUser,
                currentMembership,
                editablePlayer,
                ownProfileAccess,
                canEditProfile,
                canManagePlayers,
              }),
            );
          }

          if (!canEditProfile) {
            Alert.alert('Vínculo pendente', blockedDescription);
          }
        }}
        onSubmitInvalid={(errors) => {
          if (__DEV__) {
            console.warn('[player-edit] submit invalid', {
              ...buildPlayerEditAuditPayload({
                routePlayerId: String(playerId),
                teamId: team.id,
                currentUser,
                currentMembership,
                editablePlayer,
                ownProfileAccess,
                canEditProfile,
                canManagePlayers,
              }),
              errorFields: Object.keys(errors),
            });
          }

          Alert.alert(
            'Revise os campos',
            'Confira os campos destacados antes de salvar o perfil.',
          );
        }}
        onSubmit={async (payload) => {
          try {
            const { pendingPhoto, ...playerPayload } = payload;
            const baseUpdateInput = {
              fullName: playerPayload.fullName,
              nickname: playerPayload.nickname,
              photoUrl: pendingPhoto
                ? editablePlayer.photoUrl ?? null
                : playerPayload.photoUrl,
              jerseyNumber: playerPayload.jerseyNumber,
              primaryPosition: playerPayload.primaryPosition,
              secondaryPositions: playerPayload.secondaryPositions,
              dominantFoot: playerPayload.dominantFoot,
              status: playerPayload.status,
              linkedEmail: playerPayload.linkedEmail ?? null,
              bio: playerPayload.bio,
              preferredPosition: playerPayload.preferredPosition,
              introVideoUrl: playerPayload.introVideoUrl ?? null,
              celebrationVideoUrl: playerPayload.celebrationVideoUrl ?? null,
              allowSelfEditJerseyNumber:
                playerPayload.allowSelfEditJerseyNumber ?? false,
              manualStats: playerPayload.manualStats,
              ...(canManagePresentationVideo
                ? {
                    presentationVideoUrl: pendingPresentationVideo
                      ? editablePlayer.presentationVideoUrl ?? null
                      : currentPresentationVideoUrl,
                  }
                : {}),
            };
            const updateInput =
              variant === 'self'
                ? pickSelfPlayerProfileEditableInput(baseUpdateInput)
                : baseUpdateInput;

            if (__DEV__) {
              console.log('[player-profile] save-pressed', {
                ...buildPlayerEditAuditPayload({
                  routePlayerId: String(playerId),
                  teamId: team.id,
                  currentUser,
                  currentMembership,
                  editablePlayer,
                  ownProfileAccess,
                  canEditProfile,
                  canManagePlayers,
                }),
                variant,
                ownProfileAccess: {
                  allowed: ownProfileAccess.allowed,
                  source: ownProfileAccess.source,
                  reason: ownProfileAccess.reason,
                },
                fields: Object.keys(updateInput).filter(
                  (key) =>
                    (updateInput as Record<string, unknown>)[key] !== undefined,
                ),
                hasPendingPhoto: Boolean(pendingPhoto),
                hasPendingPresentationVideo: Boolean(pendingPresentationVideo),
              });
            }

            await updatePlayer(
              editablePlayer.id,
              updateInput,
            );

            if (pendingPhoto) {
              try {
                if (__DEV__) {
                  console.log('[player-photo] upload-start', {
                    playerId: editablePlayer.id,
                    teamId: editablePlayer.teamId,
                  });
                }

                setPhotoUploadProgress(0);
                const uploadedPhoto = await uploadImage({
                  asset: pendingPhoto,
                  storagePath: buildPlayerPhotoStoragePath(editablePlayer.teamId, editablePlayer.id),
                  cacheBustKey: Date.now(),
                  onProgress: setPhotoUploadProgress,
                });
                await updatePlayer(editablePlayer.id, {
                  photoUrl: uploadedPhoto.downloadUrl,
                });
              } catch (error) {
                if (__DEV__) {
                  console.error('[player-photo] upload-error', {
                    ...getErrorDebugInfo(error),
                    playerId: editablePlayer.id,
                    teamId: editablePlayer.teamId,
                  });
                }

                Alert.alert(
                  'Alterações salvas sem trocar a foto',
                  isPermissionDeniedError(error)
                    ? getProfilePhotoSaveErrorMessage(error)
                    : getProfilePhotoUploadErrorMessage(error),
                );
              } finally {
                setPhotoUploadProgress(null);
              }
            }

            if (canManagePresentationVideo && pendingPresentationVideo) {
              try {
                if (__DEV__) {
                  console.log('[player-video] upload-start', {
                    playerId: editablePlayer.id,
                    teamId: editablePlayer.teamId,
                  });
                }

                setPresentationVideoUploadProgress(0);
                const uploadedVideo = await uploadVideo({
                  asset: pendingPresentationVideo,
                  storagePath: buildPlayerPresentationVideoStoragePath(
                    editablePlayer.teamId,
                    editablePlayer.id,
                  ),
                  onProgress: setPresentationVideoUploadProgress,
                });
                await updatePlayer(editablePlayer.id, {
                  presentationVideoUrl: uploadedVideo.downloadUrl,
                });
              } catch (error) {
                if (__DEV__) {
                  console.error('[player-video] upload-error', {
                    ...getErrorDebugInfo(error),
                    playerId: editablePlayer.id,
                    teamId: editablePlayer.teamId,
                  });
                }

                Alert.alert(
                  'Alterações salvas sem trocar o vídeo',
                  error instanceof Error
                    ? error.message
                    : 'O restante das alterações foi salvo, mas o upload do vídeo falhou.',
                );
              } finally {
                setPresentationVideoUploadProgress(null);
              }
            }

            router.replace(`/players/${editablePlayer.id}`);
          } catch (error) {
            setPhotoUploadProgress(null);
            setPresentationVideoUploadProgress(null);

            if (__DEV__) {
              console.error('[player-profile] save-error', {
                ...getErrorDebugInfo(error),
                ...buildPlayerEditAuditPayload({
                  routePlayerId: String(playerId),
                  teamId: team.id,
                  currentUser,
                  currentMembership,
                  editablePlayer,
                  ownProfileAccess,
                  canEditProfile,
                  canManagePlayers,
                }),
                variant,
                ownProfileAccess: {
                  allowed: ownProfileAccess.allowed,
                  source: ownProfileAccess.source,
                  reason: ownProfileAccess.reason,
                },
              });
            }

            Alert.alert(
              'Não foi possível salvar',
              getPlayerProfileSaveErrorMessage(error),
            );
          }
        }}
      />
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
});

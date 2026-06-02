import { useMemo, useState } from 'react';
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
import { canEditPlayerProfile, isPlayerInactive } from '@/lib/player-management';
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
  selectCurrentPlayer,
  selectCurrentTeam,
} from '@/store/selectors';

export default function EditPlayerScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const currentPlayer = useAppStore(selectCurrentPlayer);
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
  const canEditProfile = canEditPlayerProfile({
    canManagePlayers,
    currentPlayerId: currentPlayer?.id,
    targetPlayerId: editablePlayer.id,
  });
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

  if (!variant) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Você não pode editar este perfil de jogador."
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
            ? 'Os dados administrativos do cadastro continuam sob controle de quem gerencia o elenco.'
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
          introVideoUrl: editablePlayer.introVideoUrl ?? '',
          celebrationVideoUrl: editablePlayer.celebrationVideoUrl ?? '',
          allowSelfEditJerseyNumber: editablePlayer.allowSelfEditJerseyNumber ?? false,
          manualStats: editablePlayer.manualStats,
        }}
        onSubmit={async (payload) => {
          try {
            const { pendingPhoto, ...playerPayload } = payload;
            await updatePlayer(editablePlayer.id, {
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
            });

            if (pendingPhoto) {
              try {
                setPhotoUploadProgress(0);
                const uploadedPhoto = await uploadImage({
                  asset: pendingPhoto,
                  storagePath: buildPlayerPhotoStoragePath(editablePlayer.teamId, editablePlayer.id),
                  onProgress: setPhotoUploadProgress,
                });
                await updatePlayer(editablePlayer.id, {
                  photoUrl: uploadedPhoto.downloadUrl,
                });
              } catch (error) {
                Alert.alert(
                  'Alterações salvas sem trocar a foto',
                  error instanceof Error
                    ? error.message
                    : 'O restante das alterações foi salvo, mas o upload da foto falhou.',
                );
              } finally {
                setPhotoUploadProgress(null);
              }
            }

            if (canManagePresentationVideo && pendingPresentationVideo) {
              try {
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
            Alert.alert(
              'Não foi possível salvar',
              error instanceof Error ? error.message : 'Tente novamente.',
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

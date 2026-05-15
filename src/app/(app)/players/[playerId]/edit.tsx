import { Alert, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { PlayerForm } from '@/components/forms/PlayerForm';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildPlayerPhotoStoragePath, uploadImage } from '@/lib/uploadImage';
import { useAppStore } from '@/store/app-store';
import {
  findPlayerById,
  selectCanManagePlayers,
  selectCurrentPlayer,
  selectCurrentTeam,
} from '@/store/selectors';

export default function EditPlayerScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const theme = useAppTheme();
  const team = useAppStore(selectCurrentTeam);
  const canManage = useAppStore(selectCanManagePlayers);
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const player = useAppStore((state) => findPlayerById(state, String(playerId)));
  const updatePlayer = useAppStore((state) => state.updatePlayer);
  const removePlayer = useAppStore((state) => state.removePlayer);
  const reactivatePlayer = useAppStore((state) => state.reactivatePlayer);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);

  if (!team || !player) {
    return (
      <Screen>
        <EmptyState
          title="Jogador nao encontrado"
          description="O cadastro que voce tentou abrir nao existe mais."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const editablePlayer = player;

  const canSelfEdit = currentPlayer?.id === editablePlayer.id;
  const variant = canManage ? 'admin' : canSelfEdit ? 'self' : null;

  if (!variant) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Voce so pode editar o proprio perfil de jogador."
        />
      </Screen>
    );
  }

  async function handleUnlinkAccount() {
    try {
      await updatePlayer(editablePlayer.id, {
        linkedUserId: null,
        linkedEmail: null,
      });
      Alert.alert('Conta desvinculada', 'O jogador voltou a ficar sem conta conectada.');
    } catch (error) {
      Alert.alert(
        'Nao foi possivel desvincular',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleRemovePlayer() {
    Alert.alert(
      'Remover jogador',
      'Esse cadastro vai sair do elenco ativo e nao aparecera mais nas proximas partidas.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Remover jogador',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removePlayer(editablePlayer.id);
                router.replace('/players');
              } catch (error) {
                Alert.alert(
                  'Nao foi possivel remover',
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
      'Esse cadastro volta ao elenco ativo e o app tenta restaurar o vinculo da conta automaticamente.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Reativar jogador',
          onPress: () => {
            void (async () => {
              try {
                await reactivatePlayer(editablePlayer.id);
                Alert.alert('Jogador reativado', 'O cadastro voltou ao elenco ativo.');
              } catch (error) {
                Alert.alert(
                  'Nao foi possivel reativar',
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
            ? 'Atualize dados esportivos, vinculo da conta e estatisticas iniciais do jogador.'
            : 'Ajuste os dados pessoais liberados para o seu perfil dentro do time.'}
        </Text>
      </View>

      {variant === 'self' ? (
        <SectionHeader
          title={`${editablePlayer.nickname} - camisa ${editablePlayer.jerseyNumber}`}
          subtitle={editablePlayer.fullName}
        />
      ) : null}

      {variant === 'admin' && editablePlayer.linkedUserId ? (
        <AppButton
          label="Desvincular conta deste jogador"
          variant="ghost"
          onPress={() => void handleUnlinkAccount()}
        />
      ) : null}

      {variant === 'admin' && editablePlayer.status !== 'inactive' && !editablePlayer.deletedAt ? (
        <AppButton
          label="Remover jogador"
          variant="danger"
          onPress={handleRemovePlayer}
        />
      ) : null}

      {variant === 'admin' && (editablePlayer.status === 'inactive' || editablePlayer.deletedAt) ? (
        <AppButton
          label="Reativar jogador"
          onPress={handleReactivatePlayer}
        />
      ) : null}

      <PlayerForm
        variant={variant}
        submitLabel="Salvar alteracoes"
        imageUploadProgress={photoUploadProgress}
        helperText={
          variant === 'self'
            ? 'Os dados administrativos do cadastro continuam sob controle de quem gerencia o elenco.'
            : editablePlayer.linkedUserId
              ? `Conta conectada: ${editablePlayer.linkedEmail ?? 'vinculada'}`
              : 'Se voce preencher um e-mail, essa conta pode ser vinculada automaticamente quando o jogador entrar com o codigo do time.'
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
          allowSelfEditJerseyNumber:
            editablePlayer.allowSelfEditJerseyNumber ?? false,
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
                  'Alteracoes salvas sem trocar a foto',
                  error instanceof Error
                    ? error.message
                    : 'O restante das alteracoes foi salvo, mas o upload da foto falhou.',
                );
              } finally {
                setPhotoUploadProgress(null);
              }
            }

            router.replace(`/players/${editablePlayer.id}`);
          } catch (error) {
            setPhotoUploadProgress(null);
            Alert.alert(
              'Nao foi possivel salvar',
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

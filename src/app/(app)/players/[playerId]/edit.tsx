import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PlayerForm } from '@/components/forms/PlayerForm';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
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
        linkedEmail: editablePlayer.linkedEmail ?? null,
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

  return (
    <Screen>
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

      {variant === 'admin' ? (
        <AppButton
          label="Remover jogador"
          variant="danger"
          onPress={handleRemovePlayer}
        />
      ) : null}

      <PlayerForm
        variant={variant}
        submitLabel="Salvar alteracoes"
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
            await updatePlayer(editablePlayer.id, {
              fullName: payload.fullName,
              nickname: payload.nickname,
              photoUrl: payload.photoUrl,
              jerseyNumber: payload.jerseyNumber,
              primaryPosition: payload.primaryPosition,
              secondaryPositions: payload.secondaryPositions,
              dominantFoot: payload.dominantFoot,
              status: payload.status,
              linkedEmail: payload.linkedEmail ?? null,
              bio: payload.bio,
              preferredPosition: payload.preferredPosition,
              introVideoUrl: payload.introVideoUrl ?? null,
              celebrationVideoUrl: payload.celebrationVideoUrl ?? null,
              allowSelfEditJerseyNumber:
                payload.allowSelfEditJerseyNumber ?? false,
              manualStats: payload.manualStats,
            });
            router.replace(`/players/${editablePlayer.id}`);
          } catch (error) {
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

import { Alert, Clipboard, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
import { PlayerCard } from '@/components/cards/PlayerCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  FOOT_LABELS,
  PLAYER_STATUS_LABELS,
  POSITION_LABELS,
} from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildPlayerAggregates } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManagePlayers,
  findPlayerById,
  selectCanManageTeam,
  selectCurrentPlayer,
  selectCurrentTeam,
} from '@/store/selectors';

export default function PlayerDetailsScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const team = useAppStore(selectCurrentTeam);
  const canManagePlayers = useAppStore(selectCanManagePlayers);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const player = useAppStore((state) => findPlayerById(state, String(playerId)));
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

  const currentTeam = team;
  const currentPlayerRecord = player;

  const canSelfAccess = currentPlayer?.id === currentPlayerRecord.id;
  if (!canManagePlayers && !canSelfAccess) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Voce so pode abrir o proprio perfil de jogador."
        />
      </Screen>
    );
  }

  const aggregate = buildPlayerAggregates(snapshot, currentTeam.id).find(
    (item) => item.player.id === currentPlayerRecord.id,
  );
  const linkLabel = currentPlayerRecord.linkedUserId
    ? 'Conta vinculada'
    : currentPlayerRecord.linkedEmail
      ? `E-mail reservado: ${currentPlayerRecord.linkedEmail}`
      : 'Sem conta vinculada';

  function handleCopyInvite() {
    Clipboard.setString(
      `Entre no time ${currentTeam.name} usando o codigo ${currentTeam.inviteCode}.`,
    );
    Alert.alert('Convite copiado', 'A mensagem de convite foi copiada para enviar ao jogador.');
  }

  function handleRemovePlayer() {
    Alert.alert(
      'Remover jogador',
      'Esse jogador vai sair do elenco ativo e nao aparecera mais nas proximas partidas do time.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Remover jogador',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removePlayer(currentPlayerRecord.id);
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
      <SectionHeader
        title={`#${currentPlayerRecord.jerseyNumber} ${currentPlayerRecord.nickname}`}
        subtitle={currentPlayerRecord.fullName}
        actionLabel="Editar"
        onAction={() => router.push(`/players/${currentPlayerRecord.id}/edit`)}
      />

      <PlayerCard player={currentPlayerRecord} />

      <View style={styles.buttonRow}>
        <AppButton
          label={canManagePlayers ? 'Editar jogador' : 'Editar meu perfil'}
          onPress={() => router.push(`/players/${currentPlayerRecord.id}/edit`)}
        />
        {canManageTeam ? (
          <AppButton label="Copiar convite" variant="secondary" onPress={handleCopyInvite} />
        ) : null}
        {canManagePlayers ? (
          <AppButton
            label="Remover jogador"
            variant="danger"
            onPress={handleRemovePlayer}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.infoCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.infoTitle, { color: theme.colors.text }]}>Resumo do cadastro</Text>
        <View style={styles.pillWrap}>
          <Pill label={PLAYER_STATUS_LABELS[currentPlayerRecord.status]} color={theme.colors.secondary} />
          <Pill label={POSITION_LABELS[currentPlayerRecord.primaryPosition]} color={theme.colors.primary} />
          <Pill label={FOOT_LABELS[currentPlayerRecord.dominantFoot]} color={theme.colors.accent} />
        </View>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{linkLabel}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Posicoes secundarias:{' '}
          {currentPlayerRecord.secondaryPositions.length > 0
            ? currentPlayerRecord.secondaryPositions.map((position) => POSITION_LABELS[position]).join(', ')
            : 'Nao informadas'}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Posicao preferida:{' '}
          {currentPlayerRecord.preferredPosition
            ? POSITION_LABELS[currentPlayerRecord.preferredPosition]
            : 'Nao informada'}
        </Text>
        {currentPlayerRecord.bio ? (
          <Text style={[styles.bio, { color: theme.colors.textMuted }]}>{currentPlayerRecord.bio}</Text>
        ) : null}
      </View>

      {aggregate ? (
        <>
          <View style={styles.metricsRow}>
            <MetricCard label="Jogos" value={String(aggregate.games)} helper="total" />
            <MetricCard label="Gols" value={String(aggregate.goals)} helper="marcados" />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              label="Assistencias"
              value={String(aggregate.assists)}
              helper="distribuidas"
            />
            <MetricCard
              label="MVPs"
              value={String(aggregate.mvps)}
              helper={`${aggregate.goalParticipations} participacoes`}
            />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              label="Media de gol"
              value={String(aggregate.goalsPerGame)}
              helper="por jogo"
            />
            <MetricCard
              label="Aproveitamento"
              value={`${aggregate.winRate}%`}
              helper={`${aggregate.wins}V ${aggregate.draws}E ${aggregate.losses}D`}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  infoTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  bio: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

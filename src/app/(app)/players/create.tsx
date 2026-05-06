import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { PlayerForm } from '@/components/forms/PlayerForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManagePlayers,
  selectCurrentTeam,
  selectTeamPlayers,
} from '@/store/selectors';

export default function CreatePlayerScreen() {
  const theme = useAppTheme();
  const team = useAppStore(selectCurrentTeam);
  const canManage = useAppStore(selectCanManagePlayers);
  const players = useAppStore(selectTeamPlayers);
  const createPlayer = useAppStore((state) => state.createPlayer);
  const suggestedJersey = players.reduce((max, player) => Math.max(max, player.jerseyNumber), 0) + 1;

  if (!team || !canManage) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Somente o administrador do time pode cadastrar jogadores."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Novo jogador</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Cadastre quem vai entrar em campo e deixe o elenco pronto para os proximos jogos.
        </Text>
      </View>
      <PlayerForm
        variant="admin"
        submitLabel="Salvar jogador"
        defaults={{
          fullName: '',
          nickname: '',
          photoUrl: '',
          jerseyNumber: suggestedJersey,
          primaryPosition: 'midfielder',
          secondaryPositions: [],
          dominantFoot: 'right',
          status: 'active',
          linkedEmail: '',
          bio: '',
          preferredPosition: 'midfielder',
          introVideoUrl: '',
          celebrationVideoUrl: '',
          allowSelfEditJerseyNumber: false,
          manualStats: {
            matches: 0,
            goals: 0,
            assists: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            mvps: 0,
          },
        }}
        onSubmit={async (payload) => {
          try {
            const playerId = await createPlayer({
              ...payload,
              teamId: team.id,
              linkedUserId: null,
              linkedEmail: payload.linkedEmail ?? null,
              introVideoUrl: payload.introVideoUrl ?? null,
              celebrationVideoUrl: payload.celebrationVideoUrl ?? null,
              allowSelfEditJerseyNumber:
                payload.allowSelfEditJerseyNumber ?? false,
              manualStats: payload.manualStats,
            });
            router.replace(`/players/${playerId}`);
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

import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { APP_NAME } from '@/constants/branding';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import {
  selectCurrentPlayer,
  selectCurrentRoleLabel,
  selectCurrentTeam,
  selectCurrentUser,
} from '@/store/selectors';

export default function ProfileScreen() {
  const isWeb = Platform.OS === 'web';
  const theme = useAppTheme();
  const user = useAppStore(selectCurrentUser);
  const player = useAppStore(selectCurrentPlayer);
  const team = useAppStore(selectCurrentTeam);
  const currentRoleLabel = useAppStore(selectCurrentRoleLabel);
  const logout = useAppStore((state) => state.logout);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) {
    return null;
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      Alert.alert(
        'Não foi possível sair',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen>
      {!isWeb ? (
        <SectionHeader
          title="Conta e acesso"
          subtitle={`Seu cadastro dentro do ${APP_NAME}`}
        />
      ) : null}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <View style={styles.header}>
          <Avatar name={user.displayName} photoUrl={player?.photoUrl} size={84} />
          <View style={styles.copy}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{user.displayName}</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{user.email}</Text>
            <View style={styles.badgeRow}>
              <Pill
                label={currentRoleLabel}
                backgroundColor={theme.colors.backgroundElevated}
                borderColor={theme.colors.border}
                textColor={theme.colors.text}
              />
              <Pill
                label={player ? `Atleta: ${player.nickname}` : 'Sem atleta conectado'}
                color={theme.colors.secondary}
              />
            </View>
          </View>
        </View>
        <View style={styles.metaBlock}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>Time atual</Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {team?.name ?? 'Você ainda não faz parte de um time'}
          </Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>Perfil no elenco</Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {player
              ? `#${player.jerseyNumber} ${player.nickname}`
              : 'Sem atleta associado por enquanto'}
          </Text>
        </View>
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          {team
            ? 'Seu time está pronto para jogar.'
            : 'Use um código de convite para entrar em um time ou atualizar seu acesso.'}
        </Text>
        <AppButton
          label={team ? 'Trocar time' : 'Entrar com código'}
          variant="secondary"
          onPress={() => router.push('/team-access' as never)}
        />
        {player ? (
          <AppButton
            label="Ver meu perfil de jogador"
            variant="secondary"
            onPress={() => router.push(`/players/${player.id}`)}
          />
        ) : null}
        <AppButton
          label="Sair"
          variant="danger"
          onPress={() => void handleLogout()}
          loading={loggingOut}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metaBlock: {
    gap: 4,
  },
  metaLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  metaValue: {
    fontFamily: fonts.body,
    fontSize: 14,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
});

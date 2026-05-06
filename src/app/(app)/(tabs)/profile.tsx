import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Avatar } from '@/components/ui/Avatar';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
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
        'Nao foi possivel sair',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen>
      <SectionHeader title="Perfil" subtitle="Sua conta, seu time atual e o papel em campo" />
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <View style={styles.header}>
          <Avatar name={user.displayName} size={64} />
          <View style={styles.copy}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{user.displayName}</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{user.email}</Text>
          </View>
        </View>
        <Text style={[styles.meta, { color: theme.colors.text }]}>
          Funcao atual: {currentRoleLabel}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.text }]}>
          Time atual: {team?.name ?? 'Voce ainda nao faz parte de um time'}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.text }]}>
          Perfil em campo: {player?.nickname ?? 'Aguardando vinculacao'}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.secondary }]}>Conta conectada</Text>
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          {team
            ? 'Seu time esta pronto para jogar.'
            : 'Use um codigo de convite para entrar em um time ou atualize seu acesso.'}
        </Text>
        <AppButton
          label={team ? 'Trocar time' : 'Entrar com codigo'}
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
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
});

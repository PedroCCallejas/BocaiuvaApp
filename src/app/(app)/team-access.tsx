import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { normalizeInviteCode } from '@/lib/team';
import { useAppStore } from '@/store/app-store';
import {
  selectCanCreateTeam,
  selectCurrentTeam,
  selectCurrentUser,
  selectUserMemberships,
} from '@/store/selectors';

const schema = z.object({
  inviteCode: z.string().min(4, 'Informe o código do time.'),
});

type JoinTeamValues = z.infer<typeof schema>;

function buildRoleLabel(roles: string[]) {
  const hasAdmin = roles.includes('admin');
  const hasPlayer = roles.includes('player');

  if (hasAdmin && hasPlayer) {
    return 'Admin e Jogador';
  }

  if (hasAdmin) {
    return 'Admin';
  }

  if (hasPlayer) {
    return 'Jogador';
  }

  return 'Participante';
}

export default function TeamAccessScreen() {
  const theme = useAppTheme();
  const currentUser = useAppStore(selectCurrentUser);
  const currentTeam = useAppStore(selectCurrentTeam);
  const canCreateTeam = useAppStore(selectCanCreateTeam);
  const memberships = useAppStore(selectUserMemberships);
  const teams = useAppStore((state) => state.snapshot.teams);
  const joinTeamWithInviteCode = useAppStore((state) => state.joinTeamWithInviteCode);
  const setActiveTeam = useAppStore((state) => state.setActiveTeam);
  const refreshAccess = useAppStore((state) => state.refreshAccess);
  const logout = useAppStore((state) => state.logout);
  const [submittingJoin, setSubmittingJoin] = useState(false);
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null);
  const [refreshingAccess, setRefreshingAccess] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinTeamValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      inviteCode: '',
    },
  });

  const membershipCards = useMemo(
    () =>
      memberships
        .map((membership) => ({
          membership,
          team: teams.find((team) => team.id === membership.teamId) ?? null,
        }))
        .filter(
          (
            item,
          ): item is {
            membership: (typeof memberships)[number];
            team: (typeof teams)[number];
          } => item.team != null,
        ),
    [memberships, teams],
  );

  async function handleJoin(values: JoinTeamValues) {
    setSubmittingJoin(true);

    try {
      const result = await joinTeamWithInviteCode(values.inviteCode);
      if (result.alreadyMember) {
        Alert.alert(
          'Time atualizado',
          'Você já fazia parte desse time. Ele agora está selecionado para o seu app.',
        );
      }
      router.replace('/home');
    } catch (error) {
      Alert.alert(
        'Não foi possível entrar no time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSubmittingJoin(false);
    }
  }

  async function handleSelectTeam(teamId: string) {
    setSwitchingTeamId(teamId);

    try {
      await setActiveTeam(teamId);
      router.replace('/home');
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir esse time',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSwitchingTeamId(null);
    }
  }

  async function handleRefreshAccess() {
    setRefreshingAccess(true);

    try {
      await refreshAccess();
      Alert.alert(
        'Acesso atualizado',
        'Se sua liberação já foi feita, a opção de criar um novo time aparece aqui.',
      );
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar o acesso',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setRefreshingAccess(false);
    }
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
    <Screen formMode contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {membershipCards.length > 0 ? 'Meus times' : 'Entrar em um time'}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {membershipCards.length > 0
            ? 'Escolha o time que você quer abrir agora ou use um código para entrar em outro elenco.'
            : currentUser?.displayName
              ? `${currentUser.displayName}, você precisa de um código de convite para acessar um time.`
              : 'Você precisa de um código de convite para acessar um time.'}
        </Text>
        {canCreateTeam ? (
          <Text style={[styles.accessBadge, { color: theme.colors.secondary }]}>
            Acesso liberado
          </Text>
        ) : null}
      </View>

      {membershipCards.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
            Times que você participa
          </Text>
          {membershipCards.map(({ membership, team }) => {
            const isCurrent = currentTeam?.id === team.id;

            return (
              <View
                key={membership.id}
                style={[
                  styles.teamCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: isCurrent ? team.primaryColor : theme.colors.border,
                  },
                ]}>
                <View style={styles.teamCopy}>
                  <Text style={[styles.teamName, { color: theme.colors.text }]}>{team.name}</Text>
                  <Text style={[styles.teamMeta, { color: theme.colors.textMuted }]}>
                    {buildRoleLabel(membership.roles)}
                    {isCurrent ? ' - Time atual' : ''}
                  </Text>
                </View>
                <AppButton
                  label={isCurrent ? 'Abrir time atual' : 'Entrar'}
                  variant={isCurrent ? 'secondary' : 'primary'}
                  onPress={() => void handleSelectTeam(team.id)}
                  loading={switchingTeamId === team.id}
                  fullWidth
                />
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          title="Você ainda não faz parte de um time"
          description="Entre com um código de convite para começar a acompanhar seu elenco."
        />
      )}

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Entrar com código</Text>
        <Controller
          control={control}
          name="inviteCode"
          render={({ field }) => (
            <AppInput
              label="Código do time"
              autoCapitalize="characters"
              autoCorrect={false}
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={(text) => field.onChange(normalizeInviteCode(text))}
              error={errors.inviteCode?.message}
            />
          )}
        />
        <AppButton
          label="Entrar no time"
          onPress={handleSubmit(handleJoin)}
          loading={submittingJoin}
          fullWidth
        />
      </View>

      {canCreateTeam ? (
        <AppButton
          label={membershipCards.length > 0 ? 'Criar novo time' : 'Criar meu time'}
          variant="secondary"
          onPress={() => router.push('/team-setup' as never)}
          fullWidth
        />
      ) : null}

      <AppButton
        label="Atualizar acesso"
        variant="ghost"
        onPress={() => void handleRefreshAccess()}
        loading={refreshingAccess}
        fullWidth
      />
      <AppButton
        label="Sair da conta"
        variant="danger"
        onPress={() => void handleLogout()}
        loading={loggingOut}
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    gap: 18,
  },
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  accessBadge: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  teamCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  teamCopy: {
    gap: 6,
  },
  teamName: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  teamMeta: {
    fontFamily: fonts.body,
    fontSize: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 14,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
});

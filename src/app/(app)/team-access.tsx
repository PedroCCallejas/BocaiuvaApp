import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import {
  TEAM_ACCESS_PERMISSION_MESSAGE,
  USER_ACCOUNT_PERMISSION_MESSAGE,
} from '@/constants/access-notices';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  MAX_OWNED_TEAMS_PER_ACCOUNT,
  normalizeInviteCode,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
} from '@/lib/team';
import { authService } from '@/services/auth';
import { useAppStore } from '@/store/app-store';
import {
  selectCanCreateTeam,
  selectCurrentTeam,
  selectCurrentUser,
  selectOwnedTeamsCount,
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
  const ownedTeamsCount = useAppStore(selectOwnedTeamsCount);
  const memberships = useAppStore(selectUserMemberships);
  const teams = useAppStore((state) => state.snapshot.teams);
  const accessNotice = useAppStore((state) => state.snapshot.accessNotice ?? null);
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
  const isUserAccountPermissionState = accessNotice === USER_ACCOUNT_PERMISSION_MESSAGE;
  const isPermissionDeniedState =
    isUserAccountPermissionState || accessNotice === TEAM_ACCESS_PERMISSION_MESSAGE;
  const emptyStateTitle = isUserAccountPermissionState
    ? 'Não foi possível carregar sua conta'
    : isPermissionDeniedState
      ? 'Não foi possível carregar seus times'
      : 'Você ainda não participa de nenhum time';
  const emptyStateDescription = isUserAccountPermissionState
    ? USER_ACCOUNT_PERMISSION_MESSAGE
    : isPermissionDeniedState
      ? TEAM_ACCESS_PERMISSION_MESSAGE
      : 'Entre com um código de convite para começar a acompanhar seu elenco.';

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const authUser = authService.getCurrentUser();
    const requestedTeamIds = [...new Set(memberships.map((membership) => membership.teamId))];
    const returnedTeamIds = membershipCards.map((item) => item.team.id);
    const missingTeamIds = requestedTeamIds.filter((teamId) => !returnedTeamIds.includes(teamId));
    const resolvedReason =
      membershipCards.length > 0
        ? 'teams-resolved'
        : isPermissionDeniedState
          ? 'permission-denied-or-blocked'
          : memberships.length === 0
            ? 'no-memberships-found'
            : missingTeamIds.length > 0
              ? 'memberships-found-but-team-docs-missing-or-inaccessible'
              : currentUser?.activeTeamId
                ? 'active-team-not-resolved'
                : 'no-active-team-and-no-visible-team';

    console.log(
      '[team-access-debug] auth-user',
      JSON.stringify(
        {
          uid: authUser?.authId ?? null,
          email: authUser?.email ?? null,
        },
        null,
        2,
      ),
    );
    console.log(
      '[team-access-debug] user-doc',
      JSON.stringify(
        {
          exists: currentUser != null,
          activeTeamId: currentUser?.activeTeamId ?? null,
          error: isPermissionDeniedState ? accessNotice : null,
        },
        null,
        2,
      ),
    );
    console.log(
      '[team-access-debug] memberships-query',
      JSON.stringify(
        {
          query: authUser?.authId
            ? `teamMembers where userId == "${authUser.authId}"`
            : 'teamMembers where userId == null',
          count: memberships.length,
          ids: memberships.map((membership) => membership.id),
          teamIds: memberships.map((membership) => membership.teamId),
          status: memberships.map((membership) => membership.status),
          roles: memberships.map((membership) => membership.roles),
          playerIds: memberships.map((membership) => membership.playerId),
          error: isPermissionDeniedState ? accessNotice : null,
        },
        null,
        2,
      ),
    );
    console.log(
      '[team-access-debug] teams-query',
      JSON.stringify(
        {
          requestedTeamIds,
          countReturned: returnedTeamIds.length,
          returnedIds: returnedTeamIds,
          missingTeamIds,
          error: isPermissionDeniedState ? accessNotice : null,
        },
        null,
        2,
      ),
    );
    console.log(
      '[team-access-debug] resolved-teams',
      JSON.stringify(
        {
          currentTeam: currentTeam?.id ?? null,
          availableTeams: returnedTeamIds,
          activeTeamId: currentUser?.activeTeamId ?? null,
          reason: resolvedReason,
        },
        null,
        2,
      ),
    );
  }, [
    accessNotice,
    currentTeam,
    currentUser,
    isPermissionDeniedState,
    memberships,
    membershipCards,
  ]);

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
        'Dados atualizados',
        'Se você criou, entrou ou recebeu acesso a um time em outro aparelho, ele aparece aqui.',
      );
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar os dados',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setRefreshingAccess(false);
    }
  }

  function handleGoToCreateTeam() {
    if (!canCreateTeam) {
      Alert.alert('Limite atingido', OWNED_TEAMS_LIMIT_REACHED_MESSAGE);
      return;
    }

    router.push('/team-setup' as never);
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
        <Text style={[styles.accessBadge, { color: theme.colors.secondary }]}>
          {canCreateTeam
            ? `Você administra ${ownedTeamsCount} de ${MAX_OWNED_TEAMS_PER_ACCOUNT} time(s).`
            : 'Limite de 2 times atingido.'}
        </Text>
        {!canCreateTeam ? (
          <Text style={[styles.limitText, { color: theme.colors.warning }]}>
            Você já administra 2 times.
          </Text>
        ) : null}
        {accessNotice ? (
          <View
            style={[
              styles.noticeCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.warning,
              },
            ]}>
            <Text style={[styles.noticeText, { color: theme.colors.text }]}>
              {accessNotice}
            </Text>
          </View>
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
                  label={isCurrent ? 'Acessar time atual' : 'Acessar time'}
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
          title={emptyStateTitle}
          description={emptyStateDescription}
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

      <AppButton
        label={membershipCards.length > 0 ? 'Criar novo time' : 'Criar meu time'}
        variant="secondary"
        onPress={handleGoToCreateTeam}
        disabled={!canCreateTeam}
        fullWidth
      />

      <AppButton
        label="Ver galeria de times"
        variant="secondary"
        onPress={() => router.push('/teams-gallery' as never)}
        fullWidth
      />

      <AppButton
        label="Atualizar dados"
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
  limitText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
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

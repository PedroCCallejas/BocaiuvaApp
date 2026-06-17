import {
  hasMatchElapsedHours,
  isMatchInFuture,
  sortMatchesByDate,
} from '@/lib/date';
import { membershipIndicatesPlayer, resolvePlayerForUser } from '@/lib/player-linking';
import { getActiveRatingCriteria, sortRatingCriteria } from '@/lib/rating-criteria';
import {
  canCreateTeamFromOwnedTeamsCount,
  getOwnedTeamsCount,
  getRemainingOwnedTeamSlots,
} from '@/lib/team';
import { isNotificationRead, sortNotificationsByDate } from '@/lib/notifications';
import type { AppState } from '@/store/app-store';
import type {
  AppNotification,
  Match,
  MatchDiaryEntry,
  Player,
  Team,
  TeamMember,
  User,
} from '@/types/domain';

type Slice = Pick<AppState, 'snapshot' | 'currentUserId'>;
type SyncSlice = Pick<AppState, 'syncStatus' | 'hasLiveSync' | 'lastSyncedAt'>;

interface DerivedSnapshotSelectors {
  currentUser: User | null;
  currentMembership: TeamMember | null;
  currentTeam: Team | null;
  currentPlayer: Player | null;
  userMemberships: TeamMember[];
  teamPlayers: Player[];
  teamHistoricalPlayers: Player[];
  teamMatches: Match[];
  teamMatchDiaryEntries: MatchDiaryEntry[];
  teamNotifications: AppNotification[];
  unreadNotifications: AppNotification[];
  upcomingMatches: Match[];
  overdueMatches: Match[];
  openMatches: Match[];
  finishedMatches: Match[];
  teamRatingCriteria: AppState['snapshot']['ratingCriteria'];
  activeTeamRatingCriteria: AppState['snapshot']['ratingCriteria'];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  canCreateTeam: boolean;
  ownedTeamsCount: number;
  remainingOwnedTeamSlots: number;
  currentRoleLabel: string;
}

function isPlayerAvailable(player: Player | null | undefined) {
  return Boolean(player && player.status === 'active' && !player.deletedAt);
}

function scoreMembership(membership: TeamMember) {
  return (
    membership.roles.length * 1000 +
    (membership.canManageTeam ? 100 : 0) +
    (membership.canManagePlayers ? 50 : 0) +
    (membership.playerId ? 25 : 0) +
    new Date(membership.updatedAt).getTime() / 1_000_000_000_000
  );
}

function dedupeMemberships(memberships: TeamMember[]) {
  const byTeamId = new Map<string, TeamMember[]>();

  for (const membership of memberships) {
    const current = byTeamId.get(membership.teamId) ?? [];
    byTeamId.set(membership.teamId, [...current, membership]);
  }

  return [...byTeamId.values()].map((items) => {
    if (items.length === 1) {
      return items[0];
    }

    const sorted = [...items].sort(
      (left, right) => scoreMembership(right) - scoreMembership(left),
    );
    const winner = sorted[0];

    return {
      ...winner,
      playerId:
        sorted.find((membership) => membership.playerId)?.playerId ??
        winner.playerId ??
        null,
      roles: [...new Set(sorted.flatMap((membership) => membership.roles))],
      canManageTeam: sorted.some((membership) => membership.canManageTeam),
      canManagePlayers: sorted.some((membership) => membership.canManagePlayers),
      joinedAt: sorted.reduce(
        (earliest, membership) =>
          membership.joinedAt.localeCompare(earliest) < 0
            ? membership.joinedAt
            : earliest,
        winner.joinedAt,
      ),
      updatedAt: sorted.reduce(
        (latest, membership) =>
          membership.updatedAt.localeCompare(latest) > 0
            ? membership.updatedAt
            : latest,
        winner.updatedAt,
      ),
      status: sorted.some((membership) => membership.status === 'active')
        ? 'active'
        : winner.status,
    };
  });
}

function resolveCurrentPlayer(
  players: Player[],
  currentUser: User | null,
  currentMembership: TeamMember | null,
) {
  if (!currentUser || !currentMembership) {
    return null;
  }

  if (!membershipIndicatesPlayer(currentMembership)) {
    return resolvePlayerForUser({
      teamPlayers: players,
      teamId: currentMembership.teamId,
      user: currentUser,
    });
  }

  return resolvePlayerForUser({
    teamPlayers: players,
    teamId: currentMembership.teamId,
    user: currentUser,
    membership: currentMembership,
  });
}

let cachedSnapshot: AppState['snapshot'] | null = null;
let cachedCurrentUserId: string | null = null;
let cachedDerived: DerivedSnapshotSelectors | null = null;

function buildRoleLabel(membership: TeamMember | null) {
  if (!membership) {
    return 'Sem time';
  }

  const isAdmin = membership.roles.includes('admin');
  const isPlayer = membership.roles.includes('player');

  if (isAdmin && isPlayer) {
    return 'Admin e Jogador';
  }

  if (isAdmin) {
    return 'Admin';
  }

  if (isPlayer) {
    return 'Jogador';
  }

  return 'Participante';
}

function sortMatchDiaryEntries(entries: MatchDiaryEntry[]) {
  return [...entries].sort((left, right) => {
    const pinnedOrder = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));

    if (pinnedOrder !== 0) {
      return pinnedOrder;
    }

    return (
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt)
    );
  });
}

function getDerivedSelectors(state: Slice): DerivedSnapshotSelectors {
  if (
    cachedDerived &&
    cachedSnapshot === state.snapshot &&
    cachedCurrentUserId === state.currentUserId
  ) {
    return cachedDerived;
  }

  const currentUser =
    state.snapshot.users.find((user) => user.id === state.currentUserId) ?? null;
  const userMemberships = currentUser
    ? dedupeMemberships(
        [...state.snapshot.teamMembers]
        .filter((membership) => membership.userId === currentUser.id && membership.status === 'active')
        .sort((left, right) => {
          if (left.teamId === currentUser.activeTeamId) {
            return -1;
          }
          if (right.teamId === currentUser.activeTeamId) {
            return 1;
          }
          return left.joinedAt.localeCompare(right.joinedAt);
        }),
      )
    : [];
  const allowMembershipFallback = state.snapshot.accessNotice == null;
  const currentMembership =
    userMemberships.find((membership) => membership.teamId === currentUser?.activeTeamId) ??
    (allowMembershipFallback ? userMemberships[0] ?? null : null) ??
    null;
  const currentTeam =
    state.snapshot.teams.find((team) => team.id === currentMembership?.teamId) ?? null;
  const currentPlayer = resolveCurrentPlayer(
    state.snapshot.players,
    currentUser,
    currentMembership,
  );
  const teamHistoricalPlayers = currentTeam
    ? [...state.snapshot.players]
        .filter((player) => player.teamId === currentTeam.id)
        .sort((left, right) => left.jerseyNumber - right.jerseyNumber)
    : [];
  const teamPlayers = currentTeam
    ? teamHistoricalPlayers
        .filter((player) => isPlayerAvailable(player))
        .sort((left, right) => left.jerseyNumber - right.jerseyNumber)
    : [];
  const teamMatches = currentTeam
    ? sortMatchesByDate(
        state.snapshot.matches.filter((match) => match.teamId === currentTeam.id),
      )
    : [];
  const teamMatchDiaryEntries = currentTeam
    ? sortMatchDiaryEntries(
        state.snapshot.matchDiaryEntries.filter((entry) => entry.teamId === currentTeam.id),
      )
    : [];
  const teamNotifications = currentTeam
    ? sortNotificationsByDate(
        state.snapshot.notifications.filter(
          (notification) =>
            notification.teamId === currentTeam.id &&
            (
              notification.targetUserId == null ||
              notification.targetUserId === currentUser?.id
            ),
        ),
      )
    : [];
  const unreadNotifications = currentUser
    ? teamNotifications.filter(
        (notification) => !isNotificationRead(notification, currentUser.id),
      )
    : [];
  const upcomingMatches = teamMatches.filter(
    (match) =>
      match.status !== 'finished' &&
      match.status !== 'canceled' &&
      isMatchInFuture(match),
  );
  const overdueMatches = teamMatches.filter(
    (match) =>
      match.status !== 'finished' &&
      match.status !== 'canceled' &&
      hasMatchElapsedHours(match, 24),
  );
  const openMatches = teamMatches.filter(
    (match) => match.status !== 'finished' && match.status !== 'canceled',
  );
  const finishedMatches = teamMatches.filter((match) => match.status === 'finished');
  const teamRatingCriteria = currentTeam
    ? sortRatingCriteria(
        state.snapshot.ratingCriteria.filter((criterion) => criterion.teamId === currentTeam.id),
      )
    : [];
  const activeTeamRatingCriteria = getActiveRatingCriteria(teamRatingCriteria);
  const ownedTeamsCount = currentUser
    ? getOwnedTeamsCount(state.snapshot.teams, currentUser.id)
    : 0;

  cachedSnapshot = state.snapshot;
  cachedCurrentUserId = state.currentUserId;
  cachedDerived = {
    currentUser,
    currentMembership,
    currentTeam,
    currentPlayer,
    userMemberships,
    teamPlayers,
    teamHistoricalPlayers,
    teamMatches,
    teamMatchDiaryEntries,
    teamNotifications,
    unreadNotifications,
    upcomingMatches,
    overdueMatches,
    openMatches,
    finishedMatches,
    teamRatingCriteria,
    activeTeamRatingCriteria,
    canManageTeam: currentMembership?.canManageTeam === true,
    canManagePlayers: currentMembership?.canManagePlayers === true,
    canCreateTeam: currentUser ? canCreateTeamFromOwnedTeamsCount(ownedTeamsCount) : false,
    ownedTeamsCount,
    remainingOwnedTeamSlots: getRemainingOwnedTeamSlots(ownedTeamsCount),
    currentRoleLabel: buildRoleLabel(currentMembership),
  };

  return cachedDerived;
}

export function selectCurrentUser(state: Slice) {
  return getDerivedSelectors(state).currentUser;
}

export function selectCurrentMembership(state: Slice) {
  return getDerivedSelectors(state).currentMembership;
}

export function selectUserMemberships(state: Slice) {
  return getDerivedSelectors(state).userMemberships;
}

export function selectCurrentTeam(state: Slice) {
  return getDerivedSelectors(state).currentTeam;
}

export function selectCurrentPlayer(state: Slice) {
  return getDerivedSelectors(state).currentPlayer;
}

export function selectTeamPlayers(state: Slice) {
  return getDerivedSelectors(state).teamPlayers;
}

export function selectTeamHistoricalPlayers(state: Slice) {
  return getDerivedSelectors(state).teamHistoricalPlayers;
}

export function selectTeamMatches(state: Slice) {
  return getDerivedSelectors(state).teamMatches;
}

export function selectTeamNotifications(state: Slice) {
  return getDerivedSelectors(state).teamNotifications;
}

export function selectTeamMatchDiaryEntries(state: Slice) {
  return getDerivedSelectors(state).teamMatchDiaryEntries;
}

export function selectUnreadNotifications(state: Slice) {
  return getDerivedSelectors(state).unreadNotifications;
}

export function selectUnreadNotificationsCount(state: Slice) {
  return getDerivedSelectors(state).unreadNotifications.length;
}

export function selectUpcomingMatches(state: Slice) {
  return getDerivedSelectors(state).upcomingMatches;
}

export function selectOverdueMatches(state: Slice) {
  return getDerivedSelectors(state).overdueMatches;
}

export function selectOpenMatches(state: Slice) {
  return getDerivedSelectors(state).openMatches;
}

export function selectFinishedMatches(state: Slice) {
  return getDerivedSelectors(state).finishedMatches;
}

export function selectCurrentTeamRatingCriteria(state: Slice) {
  return getDerivedSelectors(state).teamRatingCriteria;
}

export function selectActiveTeamRatingCriteria(state: Slice) {
  return getDerivedSelectors(state).activeTeamRatingCriteria;
}

export function selectCanManageTeam(state: Slice) {
  return getDerivedSelectors(state).canManageTeam;
}

export function selectCanManagePlayers(state: Slice) {
  return getDerivedSelectors(state).canManagePlayers;
}

export function selectCanCreateTeam(state: Slice) {
  return getDerivedSelectors(state).canCreateTeam;
}

export function selectOwnedTeamsCount(state: Slice) {
  return getDerivedSelectors(state).ownedTeamsCount;
}

export function selectRemainingOwnedTeamSlots(state: Slice) {
  return getDerivedSelectors(state).remainingOwnedTeamSlots;
}

export function selectCurrentRoleLabel(state: Slice) {
  return getDerivedSelectors(state).currentRoleLabel;
}

export function findTeamById(state: Pick<AppState, 'snapshot'>, teamId: string) {
  return state.snapshot.teams.find((team) => team.id === teamId) ?? null;
}

export function findMatchById(state: Pick<AppState, 'snapshot'>, matchId: string) {
  return state.snapshot.matches.find((match) => match.id === matchId) ?? null;
}

export function findLineupByMatchId(state: Pick<AppState, 'snapshot'>, matchId: string) {
  return state.snapshot.lineups.find((lineup) => lineup.matchId === matchId) ?? null;
}

export function findPlayerById(state: Pick<AppState, 'snapshot'>, playerId: string) {
  return state.snapshot.players.find((player) => player.id === playerId) ?? null;
}

export function findMatchDiaryEntryById(
  state: Pick<AppState, 'snapshot'>,
  entryId: string,
) {
  return state.snapshot.matchDiaryEntries.find((entry) => entry.id === entryId) ?? null;
}

export function getMatchDiaryEntriesByMatchId(
  state: Pick<AppState, 'snapshot'>,
  matchId: string,
) {
  return sortMatchDiaryEntries(
    state.snapshot.matchDiaryEntries.filter((entry) => entry.matchId === matchId),
  );
}

export function getAttendanceSummary(state: Pick<AppState, 'snapshot'>, matchId: string) {
  const items = state.snapshot.attendance.filter((item) => item.matchId === matchId);

  return {
    confirmed: items.filter((item) => item.status === 'confirmed').length,
    absent: items.filter((item) => item.status === 'absent').length,
    pending: items.filter((item) => item.status === 'pending').length,
  };
}

export function getAttendanceBuckets(
  state: Pick<AppState, 'snapshot'>,
  matchId: string,
  options?: { filterActiveOnly?: boolean },
) {
  const items = state.snapshot.attendance.filter((item) => item.matchId === matchId);
  const players = state.snapshot.players;
  const byJersey = (left: Player, right: Player) => left.jerseyNumber - right.jerseyNumber;
  const filterActiveOnly = options?.filterActiveOnly ?? false;

  function resolvePlayer(item: { playerId: string }): Player | undefined {
    const player = players.find((p) => p.id === item.playerId);
    if (!player) return undefined;
    if (filterActiveOnly && player.status !== 'active') return undefined;
    return player;
  }

  return {
    confirmed: items
      .filter((item) => item.status === 'confirmed')
      .map(resolvePlayer)
      .filter((player): player is Player => Boolean(player))
      .sort(byJersey),
    absent: items
      .filter((item) => item.status === 'absent')
      .map(resolvePlayer)
      .filter((player): player is Player => Boolean(player))
      .sort(byJersey),
    pending: items
      .filter((item) => item.status === 'pending')
      .map(resolvePlayer)
      .filter((player): player is Player => Boolean(player))
      .sort(byJersey),
  };
}

export function selectSyncStatus(state: SyncSlice) {
  return state.syncStatus;
}

export function selectHasLiveSync(state: SyncSlice) {
  return state.hasLiveSync;
}

export function selectLastSyncedAt(state: SyncSlice) {
  return state.lastSyncedAt;
}

export function selectIsRefreshingData(state: SyncSlice) {
  return state.syncStatus === 'refreshing';
}

export function selectSyncStatusMessage(state: SyncSlice) {
  if (state.syncStatus === 'connecting') {
    return 'Conectando seu time...';
  }

  if (state.syncStatus === 'refreshing') {
    return 'Atualizando os dados do elenco...';
  }

  if (state.hasLiveSync) {
    return 'Tudo em dia entre seus aparelhos.';
  }

  return 'Dados prontos para você.';
}

export function selectSyncStatusHint(state: SyncSlice) {
  if (state.syncStatus === 'connecting') {
    return 'As novidades do time vão aparecer assim que a conexão terminar.';
  }

  if (state.syncStatus === 'refreshing') {
    return 'Buscando as últimas mudanças sem precisar sair do app.';
  }

  if (state.hasLiveSync) {
    return 'Mudanças feitas no celular ou no navegador aparecem aqui automaticamente.';
  }

  return 'Se algo ainda não apareceu, use o botão de atualizar.';
}

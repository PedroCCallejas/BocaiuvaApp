import { isMatchInFuture, sortMatchesByDate } from '@/lib/date';
import type { AppState } from '@/store/app-store';
import type { Match, Player, Team, TeamMember, User } from '@/types/domain';

type Slice = Pick<AppState, 'snapshot' | 'currentUserId'>;

interface DerivedSnapshotSelectors {
  currentUser: User | null;
  currentMembership: TeamMember | null;
  currentTeam: Team | null;
  currentPlayer: Player | null;
  userMemberships: TeamMember[];
  teamPlayers: Player[];
  teamMatches: Match[];
  upcomingMatches: Match[];
  finishedMatches: Match[];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  canCreateTeam: boolean;
  currentRoleLabel: string;
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
    ? [...state.snapshot.teamMembers]
        .filter((membership) => membership.userId === currentUser.id && membership.status === 'active')
        .sort((left, right) => {
          if (left.teamId === currentUser.activeTeamId) {
            return -1;
          }
          if (right.teamId === currentUser.activeTeamId) {
            return 1;
          }
          return left.joinedAt.localeCompare(right.joinedAt);
        })
    : [];
  const currentMembership =
    userMemberships.find((membership) => membership.teamId === currentUser?.activeTeamId) ??
    userMemberships[0] ??
    null;
  const currentTeam =
    state.snapshot.teams.find((team) => team.id === currentMembership?.teamId) ?? null;
  const currentPlayer =
    state.snapshot.players.find((player) => player.id === currentMembership?.playerId) ?? null;
  const teamPlayers = currentTeam
    ? [...state.snapshot.players]
        .filter((player) => player.teamId === currentTeam.id)
        .sort((left, right) => left.jerseyNumber - right.jerseyNumber)
    : [];
  const teamMatches = currentTeam
    ? sortMatchesByDate(
        state.snapshot.matches.filter((match) => match.teamId === currentTeam.id),
      )
    : [];
  const upcomingMatches = teamMatches.filter((match) => isMatchInFuture(match));
  const finishedMatches = teamMatches.filter((match) => match.status === 'finished');

  cachedSnapshot = state.snapshot;
  cachedCurrentUserId = state.currentUserId;
  cachedDerived = {
    currentUser,
    currentMembership,
    currentTeam,
    currentPlayer,
    userMemberships,
    teamPlayers,
    teamMatches,
    upcomingMatches,
    finishedMatches,
    canManageTeam: currentMembership?.canManageTeam === true,
    canManagePlayers: currentMembership?.canManagePlayers === true,
    canCreateTeam: currentUser?.canCreateTeam === true,
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

export function selectTeamMatches(state: Slice) {
  return getDerivedSelectors(state).teamMatches;
}

export function selectUpcomingMatches(state: Slice) {
  return getDerivedSelectors(state).upcomingMatches;
}

export function selectFinishedMatches(state: Slice) {
  return getDerivedSelectors(state).finishedMatches;
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

export function getAttendanceSummary(state: Pick<AppState, 'snapshot'>, matchId: string) {
  const items = state.snapshot.attendance.filter((item) => item.matchId === matchId);

  return {
    confirmed: items.filter((item) => item.status === 'confirmed').length,
    absent: items.filter((item) => item.status === 'absent').length,
    pending: items.filter((item) => item.status === 'pending').length,
  };
}

export function getAttendanceBuckets(state: Pick<AppState, 'snapshot'>, matchId: string) {
  const items = state.snapshot.attendance.filter((item) => item.matchId === matchId);
  const players = state.snapshot.players;

  return {
    confirmed: items
      .filter((item) => item.status === 'confirmed')
      .map((item) => players.find((player) => player.id === item.playerId))
      .filter((player): player is (typeof players)[number] => Boolean(player)),
    absent: items
      .filter((item) => item.status === 'absent')
      .map((item) => players.find((player) => player.id === item.playerId))
      .filter((player): player is (typeof players)[number] => Boolean(player)),
    pending: items
      .filter((item) => item.status === 'pending')
      .map((item) => players.find((player) => player.id === item.playerId))
      .filter((player): player is (typeof players)[number] => Boolean(player)),
  };
}

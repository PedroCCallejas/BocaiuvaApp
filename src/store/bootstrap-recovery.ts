import type { AuthSessionUser } from '@/services/auth';
import { emptySnapshot, type AppSnapshot } from '@/services/repository/types';
import type { User } from '@/types/domain';

import {
  LOST_TEAM_ACCESS_MESSAGE,
  TEAM_ACCESS_PERMISSION_MESSAGE,
  USER_ACCOUNT_PERMISSION_MESSAGE,
} from '@/constants/access-notices';

type RepositoryPermissionDeniedError = Error & {
  code?: string;
  context?: Record<string, unknown>;
  originalMessage?: string;
  partialSnapshot?: AppSnapshot;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeRecoveredUser(user: User): User {
  return {
    ...user,
    activeTeamId: null,
    teamId: null,
    playerId: null,
  };
}

function buildRecoveredSessionUser(
  sessionUser: AuthSessionUser,
  currentUser?: User | null,
): User {
  const timestamp = nowIso();

  return normalizeRecoveredUser({
    id: sessionUser.authId,
    email: sessionUser.email,
    displayName: sessionUser.displayName,
    appRole: currentUser?.appRole ?? 'player',
    canCreateTeam: currentUser?.canCreateTeam ?? true,
    activeTeamId: null,
    avatarUrl: sessionUser.avatarUrl ?? currentUser?.avatarUrl ?? null,
    notificationTokens: currentUser?.notificationTokens ?? [],
    createdAt: currentUser?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

export function extractRepositoryErrorCode(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return (error as RepositoryPermissionDeniedError).code?.replace(/^firestore\//, '');
}

export function extractRepositoryErrorContext(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return (error as RepositoryPermissionDeniedError).context;
}

export function shouldShowTeamAccessPermissionMessage(error: unknown) {
  const context = extractRepositoryErrorContext(error);
  const collection =
    typeof context?.collection === 'string' ? context.collection : null;

  return collection === 'teamMembers' || collection === 'teams';
}

export function shouldShowUserAccountPermissionMessage(error: unknown) {
  const context = extractRepositoryErrorContext(error);
  return context?.collection === 'users';
}

export function resolveBootstrapAccessNotice(error: unknown, snapshot: AppSnapshot) {
  if (shouldShowUserAccountPermissionMessage(error)) {
    return USER_ACCOUNT_PERMISSION_MESSAGE;
  }

  if (shouldShowTeamAccessPermissionMessage(error)) {
    return TEAM_ACCESS_PERMISSION_MESSAGE;
  }

  return snapshot.accessNotice;
}

export function extractRepositoryPartialSnapshot(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return (error as RepositoryPermissionDeniedError).partialSnapshot;
}

export function isRepositoryPermissionDeniedError(error: unknown) {
  return extractRepositoryErrorCode(error) === 'permission-denied';
}

export function buildBootstrapRecoverySnapshot(
  sessionUser: AuthSessionUser | null,
  partialSnapshot?: AppSnapshot,
) {
  const recoveredUsers = (partialSnapshot?.users ?? []).map(normalizeRecoveredUser);
  const existingUser = sessionUser
    ? recoveredUsers.find((user) => user.id === sessionUser.authId) ?? null
    : null;
  const users = sessionUser
    ? [
        buildRecoveredSessionUser(sessionUser, existingUser),
        ...recoveredUsers.filter((user) => user.id !== sessionUser.authId),
      ]
    : recoveredUsers;

  return {
    ...emptySnapshot,
    ...partialSnapshot,
    users,
    teams: partialSnapshot?.teams ?? [],
    teamMembers: partialSnapshot?.teamMembers ?? [],
    players: [],
    matches: [],
    lineups: [],
    attendance: [],
    matchStats: [],
    mvpVotes: [],
    playerRatings: [],
    ratingCriteria: [],
    notifications: [],
    matchDiaryEntries: [],
    seasons: [],
    accessNotice: partialSnapshot?.accessNotice ?? LOST_TEAM_ACCESS_MESSAGE,
  } satisfies AppSnapshot;
}

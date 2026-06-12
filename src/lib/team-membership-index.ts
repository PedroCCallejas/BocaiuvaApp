import { canEditOwnPlayerProfile } from '@/lib/player-profile-access';
import { normalizeEmail } from '@/lib/player-linking';
import { normalizeTeamMemberStatus } from '@/lib/team-membership';
import type { TeamMember } from '@/types/domain';
import type { FirestoreTeamMembershipIndexDocument } from '@/types/firestore';

export const TEAM_MEMBERSHIP_INDEX_MEMBERS_SUBCOLLECTION = 'members';

type TeamScopedAccessInput = {
  teamId: string;
  userId: string | null | undefined;
  membershipIndex?: FirestoreTeamMembershipIndexDocument | null;
  teamAdminUserId?: string | null;
};

function normalizeRoles(roles: TeamMember['roles'] = []) {
  return [...new Set(roles)];
}

function normalizePrimaryRole(roles: TeamMember['roles']) {
  if (roles.includes('admin')) {
    return 'admin' as const;
  }

  if (roles.includes('player')) {
    return 'player' as const;
  }

  return null;
}

export function normalizeTeamMembershipIndexDocument(
  document: FirestoreTeamMembershipIndexDocument,
): FirestoreTeamMembershipIndexDocument {
  const roles = normalizeRoles(document.roles);

  return {
    ...document,
    playerId: document.playerId ?? null,
    roles,
    role: document.role ?? normalizePrimaryRole(roles),
    sourceTeamMemberId: document.sourceTeamMemberId ?? document.membershipId,
    canManageTeam: document.canManageTeam ?? roles.includes('admin'),
    canManagePlayers: document.canManagePlayers ?? roles.includes('admin'),
    status: normalizeTeamMemberStatus(document.status),
  };
}

export function buildTeamMembershipIndexDocument(
  membership: TeamMember,
): FirestoreTeamMembershipIndexDocument {
  return normalizeTeamMembershipIndexDocument({
    id: membership.userId,
    membershipId: membership.id,
    sourceTeamMemberId: membership.id,
    teamId: membership.teamId,
    userId: membership.userId,
    playerId: membership.playerId ?? null,
    role: normalizePrimaryRole(membership.roles),
    roles: membership.roles,
    canManageTeam: membership.canManageTeam,
    canManagePlayers: membership.canManagePlayers,
    joinedAt: membership.joinedAt,
    status: membership.status,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  });
}

export function hasActiveTeamMembershipIndex(input: TeamScopedAccessInput) {
  return Boolean(
    input.userId &&
      input.membershipIndex &&
      input.membershipIndex.userId === input.userId &&
      input.membershipIndex.teamId === input.teamId &&
      input.membershipIndex.status === 'active',
  );
}

export function isPrivateTeamAdmin(input: TeamScopedAccessInput) {
  return Boolean(
    input.userId &&
      input.teamAdminUserId &&
      input.teamAdminUserId === input.userId,
  );
}

export function canReadPrivateTeamData(input: TeamScopedAccessInput) {
  return isPrivateTeamAdmin(input) || hasActiveTeamMembershipIndex(input);
}

export function canManagePrivateTeamData(input: TeamScopedAccessInput) {
  return (
    isPrivateTeamAdmin(input) ||
    (hasActiveTeamMembershipIndex(input) &&
      ((input.membershipIndex?.canManageTeam ?? false) ||
        input.membershipIndex?.roles.includes('admin') === true))
  );
}

export function canManagePrivateTeamPlayers(input: TeamScopedAccessInput) {
  return (
    canManagePrivateTeamData(input) ||
    (hasActiveTeamMembershipIndex(input) &&
      (input.membershipIndex?.canManagePlayers ?? false))
  );
}

export function canEditOwnPrivatePlayer(
  input: TeamScopedAccessInput & {
    playerId: string;
    playerStatus?: 'active' | 'injured' | 'suspended' | 'inactive';
    playerDeletedAt?: string | null;
    playerLinkedUserId?: string | null;
    playerLinkedEmail?: string | null;
    userEmail?: string | null;
  },
) {
  return canEditOwnPlayerProfile({
    teamId: input.teamId,
    user: input.userId
      ? {
          id: input.userId,
          email: input.userEmail ?? '',
        }
      : null,
    membership: input.membershipIndex ?? null,
    player: {
      id: input.playerId,
      teamId: input.teamId,
      status: input.playerStatus ?? 'active',
      deletedAt: input.playerDeletedAt ?? null,
      linkedUserId: input.playerLinkedUserId ?? null,
      linkedEmail: normalizeEmail(input.playerLinkedEmail) || null,
    },
  });
}

export function canUpdateOwnAttendance(input: TeamScopedAccessInput & { playerId: string }) {
  return (
    canManagePrivateTeamData(input) ||
    (hasActiveTeamMembershipIndex(input) &&
      input.membershipIndex?.playerId === input.playerId)
  );
}

export function canCreateOwnMvpVote(
  input: TeamScopedAccessInput & { voterPlayerId: string },
) {
  return (
    hasActiveTeamMembershipIndex(input) &&
    input.membershipIndex?.playerId === input.voterPlayerId
  );
}

export function canCreateOwnPlayerRating(
  input: TeamScopedAccessInput & { raterPlayerId: string },
) {
  return (
    hasActiveTeamMembershipIndex(input) &&
    input.membershipIndex?.playerId === input.raterPlayerId
  );
}

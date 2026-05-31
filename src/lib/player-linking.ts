import type { Player, TeamMember, User } from '@/types/domain';

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? '';
}

export type PlayerResolutionSource =
  | 'membership-player-id'
  | 'linked-user-id'
  | 'linked-email'
  | 'unresolved';

export type PlayerResolutionFailureReason =
  | 'missing-user'
  | 'membership-player-not-found'
  | 'membership-player-unavailable'
  | 'membership-player-linked-to-other-user'
  | 'linked-user-id-not-found'
  | 'linked-email-not-found'
  | 'no-matching-player';

export function membershipIndicatesPlayer(
  membership?: Pick<TeamMember, 'playerId' | 'roles'> | null,
) {
  return Boolean(membership && (membership.roles.includes('player') || membership.playerId));
}

export function isPlayerAvailableForLinking(
  player: Player | null | undefined,
) {
  return Boolean(player && player.status !== 'inactive' && !player.deletedAt);
}

export function canReuseMembershipPlayerForUser(
  player: Player,
  user: Pick<User, 'id' | 'email'>,
) {
  if (!isPlayerAvailableForLinking(player)) {
    return false;
  }

  if (player.linkedUserId) {
    return player.linkedUserId === user.id;
  }

  return true;
}

export function resolvePlayerForUserWithDiagnostics(input: {
  teamPlayers: Player[];
  user: Pick<User, 'id' | 'email'> | null;
  membership?: Pick<TeamMember, 'playerId' | 'roles'> | null;
  teamId?: string | null;
}) {
  const scopedPlayers = input.teamId
    ? input.teamPlayers.filter((player) => player.teamId === input.teamId)
    : input.teamPlayers;

  if (!input.user) {
    return {
      player: null as Player | null,
      source: 'unresolved' as const,
      failureReason: 'missing-user' as const,
    };
  }

  const normalizedUserEmail = normalizeEmail(input.user.email);
  const membershipPlayerId = input.membership?.playerId ?? null;
  const membershipPlayer =
    membershipPlayerId != null
      ? scopedPlayers.find((player) => player.id === membershipPlayerId) ?? null
      : null;

  let failureReason: PlayerResolutionFailureReason | null = null;

  if (input.membership?.playerId) {
    if (!membershipPlayer) {
      failureReason = 'membership-player-not-found';
    } else if (!isPlayerAvailableForLinking(membershipPlayer)) {
      failureReason = 'membership-player-unavailable';
    } else if (
      membershipPlayer.linkedUserId &&
      membershipPlayer.linkedUserId !== input.user.id
    ) {
      failureReason = 'membership-player-linked-to-other-user';
    } else {
      return {
        player: membershipPlayer,
        source: 'membership-player-id' as const,
        failureReason: null,
      };
    }
  }

  const linkedUserPlayer =
    scopedPlayers.find(
      (player) =>
        isPlayerAvailableForLinking(player) &&
        player.linkedUserId === input.user?.id,
    ) ?? null;

  if (linkedUserPlayer) {
    return {
      player: linkedUserPlayer,
      source: 'linked-user-id' as const,
      failureReason,
    };
  }

  if (!failureReason) {
    failureReason = 'linked-user-id-not-found';
  }

  const linkedEmailPlayer =
    scopedPlayers.find(
      (player) =>
        isPlayerAvailableForLinking(player) &&
        !player.linkedUserId &&
        normalizeEmail(player.linkedEmail) === normalizedUserEmail,
    ) ?? null;

  if (linkedEmailPlayer) {
    return {
      player: linkedEmailPlayer,
      source: 'linked-email' as const,
      failureReason,
    };
  }

  return {
    player: null as Player | null,
    source: 'unresolved' as const,
    failureReason:
      failureReason ??
      (normalizedUserEmail ? 'linked-email-not-found' : 'no-matching-player'),
  };
}

export function resolvePlayerForUser(input: {
  teamPlayers: Player[];
  user: Pick<User, 'id' | 'email'>;
  membership?: Pick<TeamMember, 'playerId' | 'roles'> | null;
  teamId?: string | null;
}) {
  return resolvePlayerForUserWithDiagnostics(input).player;
}

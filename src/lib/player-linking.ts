import type { Player, TeamMember, User } from '@/types/domain';

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? '';
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

  const normalizedLinkedEmail = normalizeEmail(player.linkedEmail);
  if (!normalizedLinkedEmail) {
    return true;
  }

  return normalizedLinkedEmail === normalizeEmail(user.email);
}

export function resolvePlayerForUser(input: {
  teamPlayers: Player[];
  user: Pick<User, 'id' | 'email'>;
  membership?: Pick<TeamMember, 'playerId'> | null;
  teamId?: string | null;
}) {
  const scopedPlayers = input.teamId
    ? input.teamPlayers.filter((player) => player.teamId === input.teamId)
    : input.teamPlayers;
  const normalizedUserEmail = normalizeEmail(input.user.email);
  const membershipPlayer =
    input.membership?.playerId != null
      ? scopedPlayers.find((player) => player.id === input.membership?.playerId) ?? null
      : null;

  if (
    membershipPlayer &&
    canReuseMembershipPlayerForUser(membershipPlayer, input.user)
  ) {
    return membershipPlayer;
  }

  return (
    scopedPlayers.find(
      (player) =>
        isPlayerAvailableForLinking(player) &&
        player.linkedUserId === input.user.id,
    ) ??
    scopedPlayers.find(
      (player) =>
        isPlayerAvailableForLinking(player) &&
        !player.linkedUserId &&
        normalizeEmail(player.linkedEmail) === normalizedUserEmail,
    ) ??
    null
  );
}

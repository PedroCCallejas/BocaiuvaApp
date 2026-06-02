import { normalizeEmail } from '@/lib/player-linking';
import type { UpdatePlayerInput } from '@/services/repository/types';
import type { Player, TeamMember } from '@/types/domain';

export function isPlayerInactive(player: Pick<Player, 'status' | 'deletedAt'>) {
  return player.status === 'inactive' || Boolean(player.deletedAt);
}

export function canManagePlayerLifecycle(
  membership?: Pick<TeamMember, 'canManageTeam'> | null,
) {
  return membership?.canManageTeam === true;
}

export function canManagePlayerAccountLinking(
  membership?: Pick<TeamMember, 'canManageTeam'> | null,
) {
  return canManagePlayerLifecycle(membership);
}

export function canEditPlayerProfile(input: {
  canManagePlayers: boolean;
  currentPlayerId?: string | null;
  targetPlayerId: string;
}) {
  return input.canManagePlayers || input.currentPlayerId === input.targetPlayerId;
}

export function touchesRestrictedPlayerAdminFields(
  player: Pick<Player, 'status' | 'linkedUserId' | 'linkedEmail'>,
  input: Pick<UpdatePlayerInput, 'status' | 'linkedUserId' | 'linkedEmail'>,
) {
  const nextStatus = input.status ?? player.status;
  const nextLinkedUserId =
    input.linkedUserId !== undefined ? input.linkedUserId ?? null : player.linkedUserId ?? null;
  const nextLinkedEmail =
    input.linkedEmail !== undefined
      ? normalizeEmail(input.linkedEmail) || null
      : normalizeEmail(player.linkedEmail) || null;

  return (
    nextStatus !== player.status ||
    nextLinkedUserId !== (player.linkedUserId ?? null) ||
    nextLinkedEmail !== (normalizeEmail(player.linkedEmail) || null)
  );
}

export function buildInactivatedPlayerState<
  T extends Pick<Player, 'status' | 'deletedAt' | 'updatedAt'>,
>(player: T, updatedAt: string) {
  return {
    ...player,
    status: 'inactive' as const,
    deletedAt: updatedAt,
    updatedAt,
  };
}

export function buildReactivatedPlayerState<
  T extends Pick<Player, 'status' | 'deletedAt' | 'updatedAt'>,
>(player: T, updatedAt: string) {
  return {
    ...player,
    status: 'active' as const,
    deletedAt: null,
    updatedAt,
  };
}

export function buildUnlinkedPlayerState<
  T extends Pick<Player, 'linkedUserId' | 'linkedEmail' | 'updatedAt'>,
>(player: T, updatedAt: string) {
  return {
    ...player,
    linkedUserId: null,
    linkedEmail: null,
    updatedAt,
  };
}

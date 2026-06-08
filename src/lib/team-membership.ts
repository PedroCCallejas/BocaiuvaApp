import type { TeamMemberStatus } from '@/types/domain';

const ACTIVE_TEAM_MEMBER_STATUSES = new Set([
  'active',
  'accepted',
  'joined',
  'ativo',
  'member',
]);

const INACTIVE_TEAM_MEMBER_STATUSES = new Set([
  'inactive',
  'disabled',
  'removed',
  'revoked',
  'left',
  'blocked',
  'pending',
]);

export function normalizeTeamMemberStatus(
  status?: string | null,
): TeamMemberStatus {
  const normalizedStatus = status?.trim().toLowerCase() ?? '';

  if (ACTIVE_TEAM_MEMBER_STATUSES.has(normalizedStatus)) {
    return 'active';
  }

  if (INACTIVE_TEAM_MEMBER_STATUSES.has(normalizedStatus)) {
    return 'inactive';
  }

  return 'active';
}

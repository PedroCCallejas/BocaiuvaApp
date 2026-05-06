import type { ManualPlayerStats } from '@/types/domain';

export function slugifyTeamName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function createInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let inviteCode = '';

  for (let index = 0; index < 6; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    inviteCode += alphabet[randomIndex];
  }

  return inviteCode;
}

export function createEmptyManualStats(): ManualPlayerStats {
  return {
    matches: 0,
    goals: 0,
    assists: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    mvps: 0,
  };
}

export function normalizeManualStats(
  stats?: Partial<ManualPlayerStats> | null,
): ManualPlayerStats {
  const fallback = createEmptyManualStats();

  return {
    matches: clampNonNegativeInteger(stats?.matches ?? fallback.matches),
    goals: clampNonNegativeInteger(stats?.goals ?? fallback.goals),
    assists: clampNonNegativeInteger(stats?.assists ?? fallback.assists),
    wins: clampNonNegativeInteger(stats?.wins ?? fallback.wins),
    draws: clampNonNegativeInteger(stats?.draws ?? fallback.draws),
    losses: clampNonNegativeInteger(stats?.losses ?? fallback.losses),
    mvps: clampNonNegativeInteger(stats?.mvps ?? fallback.mvps),
  };
}

export function displayNameFromEmail(email: string) {
  return email.split('@')[0]?.trim() || 'Usuario';
}

export function deriveNickname(name: string, email: string) {
  const base = name.trim() || displayNameFromEmail(email);
  const firstChunk = base.split(' ').find(Boolean)?.trim() ?? displayNameFromEmail(email);
  return firstChunk.slice(0, 18);
}

function clampNonNegativeInteger(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

import type { ManualPlayerStats, Team } from '@/types/domain';

export const MAX_OWNED_TEAMS_PER_ACCOUNT = 2;
export const OWNED_TEAMS_LIMIT_REACHED_MESSAGE = 'Você já atingiu o limite de 2 times por conta.';

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
    matches: normalizeWholeNumber(stats?.matches ?? fallback.matches),
    goals: normalizeWholeNumber(stats?.goals ?? fallback.goals),
    assists: normalizeWholeNumber(stats?.assists ?? fallback.assists),
    wins: normalizeWholeNumber(stats?.wins ?? fallback.wins),
    draws: normalizeWholeNumber(stats?.draws ?? fallback.draws),
    losses: normalizeWholeNumber(stats?.losses ?? fallback.losses),
    mvps: normalizeDecimalNumber(stats?.mvps ?? fallback.mvps),
  };
}

export function displayNameFromEmail(email: string) {
  return email.split('@')[0]?.trim() || 'Usuário';
}

export function deriveNickname(name: string, email: string) {
  const base = name.trim() || displayNameFromEmail(email);
  const firstChunk = base.split(' ').find(Boolean)?.trim() ?? displayNameFromEmail(email);
  return firstChunk.slice(0, 18);
}

export function getOwnedTeamsCount(teams: Pick<Team, 'adminUserId'>[], userId: string) {
  return teams.filter((team) => team.adminUserId === userId).length;
}

export function canCreateTeamFromOwnedTeamsCount(ownedTeamsCount: number) {
  return ownedTeamsCount < MAX_OWNED_TEAMS_PER_ACCOUNT;
}

export function getRemainingOwnedTeamSlots(ownedTeamsCount: number) {
  return Math.max(0, MAX_OWNED_TEAMS_PER_ACCOUNT - ownedTeamsCount);
}

function normalizeWholeNumber(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

function normalizeDecimalNumber(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(2));
}

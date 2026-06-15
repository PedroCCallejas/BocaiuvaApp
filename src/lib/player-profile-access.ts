import type { Player, TeamMember, User } from '@/types/domain';
import type { FirestoreTeamMembershipIndexDocument } from '@/types/firestore';
import {
  membershipIndicatesPlayer,
  normalizeEmail,
  resolvePlayerForUserWithDiagnostics,
} from '@/lib/player-linking';

export const SELF_PLAYER_PROFILE_EDITABLE_FIELDS = [
  'photoUrl',
  'nickname',
  'bio',
  'jerseyNumber',
  'secondaryPositions',
  'dominantFoot',
  'preferredPosition',
  'introVideoUrl',
  'celebrationVideoUrl',
] as const;

export type SelfPlayerProfileEditableField =
  (typeof SELF_PLAYER_PROFILE_EDITABLE_FIELDS)[number];

export interface SelfPlayerProfileUpdateDraft {
  photoUrl?: Player['photoUrl'];
  nickname?: Player['nickname'];
  bio?: Player['bio'];
  jerseyNumber?: Player['jerseyNumber'];
  secondaryPositions?: Player['secondaryPositions'];
  dominantFoot?: Player['dominantFoot'];
  preferredPosition?: Player['preferredPosition'];
  introVideoUrl?: Player['introVideoUrl'];
  celebrationVideoUrl?: Player['celebrationVideoUrl'];
}

type MembershipLike =
  | Pick<TeamMember, 'teamId' | 'playerId' | 'roles' | 'status'>
  | Pick<FirestoreTeamMembershipIndexDocument, 'teamId' | 'playerId' | 'roles' | 'status'>;

type PlayerLike = Pick<
  Player,
  'id' | 'teamId' | 'linkedUserId' | 'linkedEmail' | 'status' | 'deletedAt'
>;

type UserLike = Pick<User, 'id' | 'email'>;

export type OwnPlayerProfileAccessSource =
  | 'membership-player-id'
  | 'linked-user-id'
  | 'linked-email';

export type OwnPlayerProfileAccessReason =
  | 'allowed'
  | 'missing-user'
  | 'missing-membership'
  | 'membership-inactive'
  | 'membership-other-team'
  | 'missing-player'
  | 'player-other-team'
  | 'player-inactive'
  | 'player-linked-to-other-user'
  | 'membership-player-mismatch'
  | 'membership-without-player-role'
  | 'missing-user-email'
  | 'linked-email-mismatch'
  | 'different-linked-player'
  | 'multiple-player-candidates'
  | 'missing-player-link';

export interface OwnPlayerProfileAccessResult {
  allowed: boolean;
  source: OwnPlayerProfileAccessSource | null;
  reason: OwnPlayerProfileAccessReason;
  diagnostics: string[];
}

function sanitizeSecondaryPositions(
  primaryPosition: Player['primaryPosition'],
  secondaryPositions: Player['secondaryPositions'],
) {
  return [...new Set(secondaryPositions)].filter(
    (position) => position !== primaryPosition,
  );
}

function hasPlayerRole(membership: MembershipLike) {
  return membership.roles.includes('player');
}

function appendUniqueDiagnostics(target: string[], values: string[]) {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}

function buildDeniedResult(
  reason: OwnPlayerProfileAccessReason,
  diagnostics: string[],
): OwnPlayerProfileAccessResult {
  return {
    allowed: false,
    source: null,
    reason,
    diagnostics,
  };
}

function buildAllowedResult(
  source: OwnPlayerProfileAccessSource,
  diagnostics: string[],
): OwnPlayerProfileAccessResult {
  return {
    allowed: true,
    source,
    reason: 'allowed',
    diagnostics,
  };
}

export function resolveOwnPlayerProfileAccess(input: {
  teamId: string;
  user: UserLike | null;
  membership?: MembershipLike | null;
  player?: PlayerLike | null;
  teamPlayers?: PlayerLike[] | null;
}): OwnPlayerProfileAccessResult {
  const diagnostics: string[] = [];

  if (!input.user) {
    diagnostics.push('Usuario autenticado ausente.');
    return buildDeniedResult('missing-user', diagnostics);
  }

  if (!input.membership) {
    diagnostics.push('Sem membership ativo no time.');
    return buildDeniedResult('missing-membership', diagnostics);
  }

  if (input.membership.status !== 'active') {
    diagnostics.push('Membership inativo.');
    return buildDeniedResult('membership-inactive', diagnostics);
  }

  if (input.membership.teamId !== input.teamId) {
    diagnostics.push('Membership de outro time.');
    return buildDeniedResult('membership-other-team', diagnostics);
  }

  if (!input.player) {
    diagnostics.push('Jogador alvo nao encontrado.');
    return buildDeniedResult('missing-player', diagnostics);
  }

  if (input.player.teamId !== input.teamId) {
    diagnostics.push('Usuario tentando editar jogador de outro time.');
    return buildDeniedResult('player-other-team', diagnostics);
  }

  if (input.player.status === 'inactive' || Boolean(input.player.deletedAt)) {
    diagnostics.push('Jogador inativo.');
    return buildDeniedResult('player-inactive', diagnostics);
  }

  if (
    input.player.linkedUserId &&
    input.player.linkedUserId !== input.user.id
  ) {
    diagnostics.push('Jogador ja vinculado a outro usuario.');
    return buildDeniedResult('player-linked-to-other-user', diagnostics);
  }

  if (input.membership.playerId === input.player.id) {
    return buildAllowedResult('membership-player-id', diagnostics);
  }

  if (input.membership.playerId != null) {
    diagnostics.push('playerId do membership difere do jogador editado.');
    return buildDeniedResult('membership-player-mismatch', diagnostics);
  }

  diagnostics.push('Membership sem playerId.');

  if (!hasPlayerRole(input.membership) && !membershipIndicatesPlayer(input.membership)) {
    diagnostics.push('Membership ativo sem papel de jogador.');
    return buildDeniedResult('membership-without-player-role', diagnostics);
  }

  const resolution = resolvePlayerForUserWithDiagnostics({
    teamPlayers: input.teamPlayers ?? [input.player],
    teamId: input.teamId,
    user: input.user,
    membership: input.membership,
  });

  appendUniqueDiagnostics(diagnostics, resolution.diagnostics);

  if (resolution.status === 'ambiguous') {
    diagnostics.push('Existe mais de um jogador ativo compativel com esta conta.');
    return buildDeniedResult('multiple-player-candidates', diagnostics);
  }

  if (resolution.player && resolution.player.id !== input.player.id) {
    diagnostics.push('Sua conta foi reconhecida em outro jogador do elenco.');
    return buildDeniedResult('different-linked-player', diagnostics);
  }

  if (input.player.linkedUserId === input.user.id) {
    return buildAllowedResult('linked-user-id', diagnostics);
  }

  diagnostics.push('Jogador sem linkedUserId correspondente.');

  const normalizedUserEmail = normalizeEmail(input.user.email);
  if (!normalizedUserEmail) {
    diagnostics.push('Usuario autenticado sem e-mail valido.');
    return buildDeniedResult('missing-user-email', diagnostics);
  }

  if (!input.player.linkedEmail) {
    diagnostics.push('Jogador sem linkedEmail.');
    return buildDeniedResult('missing-player-link', diagnostics);
  }

  if (normalizeEmail(input.player.linkedEmail) === normalizedUserEmail) {
    return buildAllowedResult('linked-email', diagnostics);
  }

  diagnostics.push('linkedEmail diferente do e-mail autenticado.');
  return buildDeniedResult('linked-email-mismatch', diagnostics);
}

export function canEditOwnPlayerProfile(input: {
  teamId: string;
  user: UserLike | null;
  membership?: MembershipLike | null;
  player?: PlayerLike | null;
  teamPlayers?: PlayerLike[] | null;
}) {
  return resolveOwnPlayerProfileAccess(input).allowed;
}

export function getOwnPlayerProfileBlockedMessage(
  result: OwnPlayerProfileAccessResult,
) {
  if (result.reason === 'multiple-player-candidates') {
    return 'Encontramos mais de um jogador ativo compativel com a sua conta. Peca ao administrador para revisar o vinculo correto.';
  }

  if (result.reason === 'different-linked-player') {
    return 'Sua conta ja esta vinculada a outro jogador deste time.';
  }

  if (result.reason === 'missing-player-link') {
    return 'Voce esta no time, mas ainda nao possui um jogador vinculado ao seu usuario.';
  }

  if (
    [
      'missing-membership',
      'membership-inactive',
      'membership-other-team',
      'membership-player-mismatch',
      'membership-without-player-role',
      'missing-user-email',
      'linked-email-mismatch',
      'missing-player-link',
      'player-linked-to-other-user',
      'missing-user',
    ].includes(result.reason)
  ) {
    return 'Seu usuário ainda não está vinculado corretamente a este jogador.';
  }

  if (result.reason === 'player-inactive') {
    return 'Esse cadastro está inativo e não pode ser editado pelo próprio jogador.';
  }

  return 'Você não pode editar este perfil de jogador.';
}

export function getInvalidSelfPlayerProfileUpdateFields(
  input: Record<string, unknown>,
) {
  const allowedFields = new Set<string>(SELF_PLAYER_PROFILE_EDITABLE_FIELDS);
  return Object.keys(input).filter((key) => !allowedFields.has(key));
}

export function pickSelfPlayerProfileEditableInput<T extends Record<string, unknown>>(
  input: T,
) {
  const filtered: Partial<T> = {};

  for (const key of SELF_PLAYER_PROFILE_EDITABLE_FIELDS) {
    const typedKey = key as keyof T;
    const value = input[typedKey];

    if (value !== undefined) {
      filtered[typedKey] = value;
    }
  }

  return filtered;
}

export function buildSelfPlayerProfileUpdatePatch(input: {
  player: Pick<Player, 'primaryPosition'>;
  changes: SelfPlayerProfileUpdateDraft;
  updatedAt: string;
}) {
  const patch: Partial<SelfPlayerProfileUpdateDraft> & { updatedAt: string } = {
    updatedAt: input.updatedAt,
  };

  if (typeof input.changes.nickname === 'string') {
    patch.nickname = input.changes.nickname.trim();
  }

  if (input.changes.photoUrl !== undefined) {
    patch.photoUrl = input.changes.photoUrl;
  }

  if (input.changes.bio !== undefined) {
    patch.bio = input.changes.bio?.trim() ?? '';
  }

  if (typeof input.changes.jerseyNumber === 'number') {
    patch.jerseyNumber = input.changes.jerseyNumber;
  }

  if (input.changes.secondaryPositions !== undefined) {
    patch.secondaryPositions = sanitizeSecondaryPositions(
      input.player.primaryPosition,
      input.changes.secondaryPositions,
    );
  }

  if (input.changes.dominantFoot !== undefined) {
    patch.dominantFoot = input.changes.dominantFoot;
  }

  if (input.changes.preferredPosition !== undefined) {
    patch.preferredPosition = input.changes.preferredPosition;
  }

  if (input.changes.introVideoUrl !== undefined) {
    patch.introVideoUrl = input.changes.introVideoUrl;
  }

  if (input.changes.celebrationVideoUrl !== undefined) {
    patch.celebrationVideoUrl = input.changes.celebrationVideoUrl;
  }

  return patch;
}

export function logOwnPlayerProfileAccess(
  scope: string,
  input: {
    teamId: string;
    user: UserLike | null;
    membership?: MembershipLike | null;
    player?: PlayerLike | null;
  },
  result: OwnPlayerProfileAccessResult,
) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }

  console.warn(
    `[own-player-profile] ${scope}`,
    JSON.stringify(
      {
        allowed: result.allowed,
        source: result.source,
        reason: result.reason,
        diagnostics: result.diagnostics,
        teamId: input.teamId,
        userId: input.user?.id ?? null,
        hasUserEmail: Boolean(normalizeEmail(input.user?.email)),
        membership: input.membership
          ? {
              teamId: input.membership.teamId,
              playerId: input.membership.playerId ?? null,
              roles: input.membership.roles,
              status: input.membership.status,
            }
          : null,
        player: input.player
          ? {
              id: input.player.id,
              teamId: input.player.teamId,
              status: input.player.status,
              deletedAt: input.player.deletedAt ?? null,
              linkedUserMatchesCurrentUser:
                input.player.linkedUserId != null &&
                input.player.linkedUserId === input.user?.id,
              hasLinkedUserId: Boolean(input.player.linkedUserId),
              hasLinkedEmail: Boolean(normalizeEmail(input.player.linkedEmail)),
              linkedEmailMatchesCurrentUser:
                normalizeEmail(input.player.linkedEmail) !== '' &&
                normalizeEmail(input.player.linkedEmail) ===
                  normalizeEmail(input.user?.email),
            }
          : null,
      },
      null,
      2,
    ),
  );
}

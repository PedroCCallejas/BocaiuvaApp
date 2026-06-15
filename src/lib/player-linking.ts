import type { Player, TeamMember, User } from '@/types/domain';
import type { FirestoreTeamMembershipIndexDocument } from '@/types/firestore';

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? '';
}

function normalizeComparableText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeComparableText(value?: string | null) {
  return [...new Set(
    normalizeComparableText(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  )];
}

function buildEmailLocalPart(email?: string | null) {
  return normalizeComparableText(normalizeEmail(email).split('@')[0] ?? '');
}

function countTokenOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightTokens = new Set(right);
  return left.filter((token) => rightTokens.has(token)).length;
}

function pushSuggestionReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

export type PlayerResolutionSource =
  | 'membership-player-id'
  | 'linked-user-id'
  | 'linked-email'
  | 'unresolved';

export type PlayerResolutionStatus = 'resolved' | 'ambiguous' | 'unresolved';

export type PlayerResolutionFailureReason =
  | 'missing-user'
  | 'membership-player-not-found'
  | 'membership-player-unavailable'
  | 'membership-player-linked-to-other-user'
  | 'linked-user-id-ambiguous'
  | 'linked-user-id-not-found'
  | 'linked-email-ambiguous'
  | 'linked-email-linked-to-other-user'
  | 'linked-email-not-found'
  | 'no-matching-player';

type MembershipLike =
  | Pick<TeamMember, 'teamId' | 'playerId' | 'roles' | 'status'>
  | Pick<FirestoreTeamMembershipIndexDocument, 'teamId' | 'playerId' | 'roles' | 'status'>;

type LinkablePlayer = Pick<
  Player,
  'id' | 'teamId' | 'linkedUserId' | 'linkedEmail' | 'status' | 'deletedAt'
>;

type SuggestiblePlayer = Pick<
  Player,
  | 'id'
  | 'teamId'
  | 'linkedUserId'
  | 'linkedEmail'
  | 'status'
  | 'deletedAt'
  | 'fullName'
  | 'nickname'
  | 'jerseyNumber'
>;

export interface PlayerResolutionDiagnostics<TPlayer extends LinkablePlayer> {
  status: PlayerResolutionStatus;
  player: TPlayer | null;
  source: PlayerResolutionSource;
  failureReason: PlayerResolutionFailureReason | null;
  diagnostics: string[];
  candidates: TPlayer[];
}

export interface PlayerLinkSuggestion {
  playerId: string;
  fullName: string;
  nickname: string;
  jerseyNumber: number;
  score: number;
  reasons: string[];
}

export interface JoinTeamPlayerLinkResolution {
  status: 'linked' | 'suggested' | 'unresolved';
  playerId: string | null;
  source: PlayerResolutionSource | null;
  message: string;
  suggestions: PlayerLinkSuggestion[];
}

export function membershipIndicatesPlayer(
  membership?: Pick<TeamMember, 'playerId' | 'roles'> | Pick<
    FirestoreTeamMembershipIndexDocument,
    'playerId' | 'roles'
  > | null,
) {
  return Boolean(membership && (membership.roles.includes('player') || membership.playerId));
}

export function isPlayerAvailableForLinking(
  player: LinkablePlayer | null | undefined,
) {
  return Boolean(player && player.status !== 'inactive' && !player.deletedAt);
}

export function canReuseMembershipPlayerForUser(
  player: LinkablePlayer,
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

export function suggestPlayerLinksForUser(input: {
  teamPlayers: SuggestiblePlayer[];
  user: Pick<User, 'id' | 'email' | 'displayName'> | null;
  teamId?: string | null;
}) {
  if (!input.user) {
    return [] satisfies PlayerLinkSuggestion[];
  }

  const scopedPlayers = input.teamId
    ? input.teamPlayers.filter((player) => player.teamId === input.teamId)
    : input.teamPlayers;
  const normalizedUserEmail = normalizeEmail(input.user.email);
  const emailLocalPart = buildEmailLocalPart(input.user.email);
  const displayName = normalizeComparableText(input.user.displayName);
  const displayTokens = tokenizeComparableText(input.user.displayName);

  return scopedPlayers
    .flatMap<PlayerLinkSuggestion>((player) => {
      if (!isPlayerAvailableForLinking(player)) {
        return [];
      }

      if (player.linkedUserId && player.linkedUserId !== input.user?.id) {
        return [];
      }

      const reasons: string[] = [];
      let score = 0;
      const normalizedNickname = normalizeComparableText(player.nickname);
      const normalizedFullName = normalizeComparableText(player.fullName);
      const nicknameTokens = tokenizeComparableText(player.nickname);
      const fullNameTokens = tokenizeComparableText(player.fullName);
      const normalizedLinkedEmail = normalizeEmail(player.linkedEmail);

      if (normalizedLinkedEmail && normalizedLinkedEmail === normalizedUserEmail) {
        score += 120;
        pushSuggestionReason(reasons, 'E-mail vinculado igual ao da conta');
      }

      if (displayName && normalizedNickname && displayName === normalizedNickname) {
        score += 70;
        pushSuggestionReason(reasons, 'Apelido igual ao nome da conta');
      } else if (
        displayName &&
        normalizedNickname &&
        (displayName.includes(normalizedNickname) || normalizedNickname.includes(displayName))
      ) {
        score += 42;
        pushSuggestionReason(reasons, 'Apelido parecido com o nome da conta');
      }

      if (displayName && normalizedFullName && displayName === normalizedFullName) {
        score += 65;
        pushSuggestionReason(reasons, 'Nome igual ao cadastro da conta');
      } else if (
        displayName &&
        normalizedFullName &&
        (displayName.includes(normalizedFullName) || normalizedFullName.includes(displayName))
      ) {
        score += 38;
        pushSuggestionReason(reasons, 'Nome parecido com o cadastro da conta');
      }

      const nicknameOverlap = countTokenOverlap(displayTokens, nicknameTokens);
      const fullNameOverlap = countTokenOverlap(displayTokens, fullNameTokens);

      if (nicknameOverlap >= 2) {
        score += 28;
        pushSuggestionReason(reasons, 'Apelido com palavras em comum com a conta');
      } else if (nicknameOverlap === 1) {
        score += 16;
        pushSuggestionReason(reasons, 'Apelido parcialmente parecido com a conta');
      }

      if (fullNameOverlap >= 2) {
        score += 24;
        pushSuggestionReason(reasons, 'Nome com palavras em comum com a conta');
      } else if (fullNameOverlap === 1) {
        score += 12;
        pushSuggestionReason(reasons, 'Nome parcialmente parecido com a conta');
      }

      if (
        emailLocalPart &&
        normalizedNickname &&
        (emailLocalPart === normalizedNickname ||
          emailLocalPart.includes(normalizedNickname) ||
          normalizedNickname.includes(emailLocalPart))
      ) {
        score += 34;
        pushSuggestionReason(reasons, 'Apelido parecido com o e-mail da conta');
      }

      if (
        emailLocalPart &&
        normalizedFullName &&
        (emailLocalPart.includes(normalizedFullName) ||
          normalizedFullName.includes(emailLocalPart))
      ) {
        score += 26;
        pushSuggestionReason(reasons, 'Nome parecido com o e-mail da conta');
      }

      if (score <= 0) {
        return [];
      }

      if (!player.linkedUserId) {
        score += 10;
        pushSuggestionReason(reasons, 'Jogador ainda não vinculado');
      }

      return [{
        playerId: player.id,
        fullName: player.fullName,
        nickname: player.nickname,
        jerseyNumber: player.jerseyNumber,
        score,
        reasons,
      }];
    })
    .filter((suggestion) => suggestion.score >= 20)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.jerseyNumber - right.jerseyNumber;
    })
    .slice(0, 3);
}

export function buildJoinTeamPlayerLinkResolution(input: {
  linkedPlayer: Pick<Player, 'id' | 'nickname'> | null;
  source?: PlayerResolutionSource | null;
  suggestions?: PlayerLinkSuggestion[];
}) {
  if (input.linkedPlayer) {
    const automaticMessageBySource: Record<
      Exclude<PlayerResolutionSource, 'unresolved'>,
      string
    > = {
      'membership-player-id': `Você entrou no time e o seu perfil ${input.linkedPlayer.nickname} já estava reservado para a sua conta.`,
      'linked-user-id': `Você entrou no time e o seu perfil ${input.linkedPlayer.nickname} já estava vinculado à sua conta.`,
      'linked-email': `Você entrou no time e o seu perfil ${input.linkedPlayer.nickname} foi vinculado automaticamente pelo e-mail da conta.`,
    };

    return {
      status: 'linked' as const,
      playerId: input.linkedPlayer.id,
      source:
        input.source && input.source !== 'unresolved'
          ? input.source
          : null,
      message:
        input.source && input.source !== 'unresolved'
          ? automaticMessageBySource[input.source]
          : `Você entrou no time e o seu perfil ${input.linkedPlayer.nickname} já está pronto para edição.`,
      suggestions: [],
    } satisfies JoinTeamPlayerLinkResolution;
  }

  const suggestions = input.suggestions ?? [];

  if (suggestions.length > 0) {
    const suggestedPlayers = suggestions
      .map((suggestion) => `${suggestion.nickname} (#${suggestion.jerseyNumber})`)
      .join(', ');
    const singleSuggestion = suggestions.length === 1;

    return {
      status: 'suggested' as const,
      playerId: null,
      source: null,
      message: singleSuggestion
        ? `Você entrou no time, mas o vínculo do jogador ainda precisa ser confirmado. O candidato mais provável é ${suggestedPlayers}. Peça ao admin para revisar esse vínculo.`
        : `Você entrou no time, mas o vínculo do jogador ainda precisa ser confirmado. Candidatos sugeridos: ${suggestedPlayers}. Peça ao admin para concluir o vínculo correto.`,
      suggestions,
    } satisfies JoinTeamPlayerLinkResolution;
  }

  return {
    status: 'unresolved' as const,
    playerId: null,
    source: null,
    message:
      'Você entrou no time, mas ainda não existe jogador vinculado à sua conta. Peça ao admin para vincular seu perfil antes de editar dados como jogador.',
    suggestions: [],
  } satisfies JoinTeamPlayerLinkResolution;
}

export function resolvePlayerForUserWithDiagnostics<TPlayer extends LinkablePlayer>(input: {
  teamPlayers: TPlayer[];
  user: Pick<User, 'id' | 'email'> | null;
  membership?: MembershipLike | null;
  teamId?: string | null;
}) {
  const scopedPlayers = input.teamId
    ? input.teamPlayers.filter((player) => player.teamId === input.teamId)
    : input.teamPlayers;
  const diagnostics: string[] = [];

  if (!input.user) {
    return {
      status: 'unresolved' as const,
      player: null as TPlayer | null,
      source: 'unresolved' as const,
      failureReason: 'missing-user' as const,
      diagnostics: ['Usuario autenticado ausente.'],
      candidates: [] as TPlayer[],
    };
  }

  const userId = input.user.id;
  const normalizedUserEmail = normalizeEmail(input.user.email);
  const membershipPlayerId = input.membership?.playerId ?? null;
  const membershipPlayer =
    membershipPlayerId != null
      ? scopedPlayers.find((player) => player.id === membershipPlayerId) ?? null
      : null;

  let failureReason: PlayerResolutionFailureReason | null = null;

  if (input.membership?.playerId) {
    if (!membershipPlayer) {
      diagnostics.push('playerId do membership nao foi encontrado no elenco ativo.');
      failureReason = 'membership-player-not-found';
    } else if (!isPlayerAvailableForLinking(membershipPlayer)) {
      diagnostics.push('playerId do membership aponta para jogador indisponivel.');
      failureReason = 'membership-player-unavailable';
    } else if (
      membershipPlayer.linkedUserId &&
      membershipPlayer.linkedUserId !== input.user.id
    ) {
      diagnostics.push('playerId do membership aponta para jogador vinculado a outro usuario.');
      failureReason = 'membership-player-linked-to-other-user';
    } else {
      return {
        status: 'resolved' as const,
        player: membershipPlayer,
        source: 'membership-player-id' as const,
        failureReason: null,
        diagnostics,
        candidates: [membershipPlayer],
      };
    }
  }

  const linkedUserCandidates = scopedPlayers.filter(
    (player) =>
      isPlayerAvailableForLinking(player) &&
      player.linkedUserId === input.user?.id,
  );

  if (linkedUserCandidates.length === 1) {
    return {
      status: 'resolved' as const,
      player: linkedUserCandidates[0],
      source: 'linked-user-id' as const,
      failureReason,
      diagnostics,
      candidates: linkedUserCandidates,
    };
  }

  if (linkedUserCandidates.length > 1) {
    diagnostics.push('Mais de um jogador ativo esta vinculado ao mesmo usuario.');
    return {
      status: 'ambiguous' as const,
      player: null as TPlayer | null,
      source: 'unresolved' as const,
      failureReason: 'linked-user-id-ambiguous' as const,
      diagnostics,
      candidates: linkedUserCandidates,
    };
  }

  if (!failureReason) {
    failureReason = 'linked-user-id-not-found';
  }

  if (!normalizedUserEmail) {
    return {
      status: 'unresolved' as const,
      player: null as TPlayer | null,
      source: 'unresolved' as const,
      failureReason: failureReason ?? 'no-matching-player',
      diagnostics,
      candidates: [] as TPlayer[],
    };
  }

  const linkedEmailCandidates = scopedPlayers.filter(
      (player) =>
        isPlayerAvailableForLinking(player) &&
        normalizeEmail(player.linkedEmail) === normalizedUserEmail &&
        (!player.linkedUserId || player.linkedUserId === userId),
  );

  if (linkedEmailCandidates.length === 1) {
    return {
      status: 'resolved' as const,
      player: linkedEmailCandidates[0],
      source: 'linked-email' as const,
      failureReason,
      diagnostics,
      candidates: linkedEmailCandidates,
    };
  }

  if (linkedEmailCandidates.length > 1) {
    diagnostics.push('Mais de um jogador ativo compartilha o mesmo linkedEmail.');
    return {
      status: 'ambiguous' as const,
      player: null as TPlayer | null,
      source: 'unresolved' as const,
      failureReason: 'linked-email-ambiguous' as const,
      diagnostics,
      candidates: linkedEmailCandidates,
    };
  }

  const conflictingLinkedEmailCandidates = scopedPlayers.filter(
      (player) =>
        isPlayerAvailableForLinking(player) &&
        normalizeEmail(player.linkedEmail) === normalizedUserEmail &&
        Boolean(player.linkedUserId) &&
        player.linkedUserId !== userId,
  );

  if (conflictingLinkedEmailCandidates.length > 0) {
    diagnostics.push('Existe jogador com esse linkedEmail ja vinculado a outra conta.');
  }

  return {
    status: 'unresolved' as const,
    player: null as TPlayer | null,
    source: 'unresolved' as const,
    failureReason: conflictingLinkedEmailCandidates.length > 0
      ? 'linked-email-linked-to-other-user'
      : failureReason ??
        (normalizedUserEmail ? 'linked-email-not-found' : 'no-matching-player'),
    diagnostics,
    candidates: conflictingLinkedEmailCandidates,
  };
}

export function resolvePlayerForUser<TPlayer extends LinkablePlayer>(input: {
  teamPlayers: TPlayer[];
  user: Pick<User, 'id' | 'email'>;
  membership?: MembershipLike | null;
  teamId?: string | null;
}) {
  return resolvePlayerForUserWithDiagnostics(input).player;
}

export function canSelfEditPlayerProfileWithMembershipLink(input: {
  teamId: string;
  user: Pick<User, 'id' | 'email'> | null;
  membership?: MembershipLike | null;
  player?: Pick<
    Player,
    'id' | 'teamId' | 'linkedUserId' | 'linkedEmail' | 'status' | 'deletedAt'
  > | null;
  teamPlayers?: Array<
    Pick<
      Player,
      'id' | 'teamId' | 'linkedUserId' | 'linkedEmail' | 'status' | 'deletedAt'
    >
  > | null;
}) {
  if (!input.user || !input.membership || !input.player) {
    return false;
  }

  if (input.membership.status !== 'active' || input.membership.teamId !== input.teamId) {
    return false;
  }

  if (!membershipIndicatesPlayer(input.membership)) {
    return false;
  }

  if (
    input.membership.playerId != null &&
    input.membership.playerId !== input.player.id
  ) {
    return false;
  }

  if (input.player.teamId !== input.teamId || !isPlayerAvailableForLinking(input.player)) {
    return false;
  }

  if (input.player.linkedUserId && input.player.linkedUserId !== input.user.id) {
    return false;
  }

  const resolution = resolvePlayerForUserWithDiagnostics({
    teamPlayers: input.teamPlayers ?? [input.player],
    teamId: input.teamId,
    user: input.user,
    membership: input.membership,
  });

  return resolution.status === 'resolved' && resolution.player?.id === input.player.id;
}

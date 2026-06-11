import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import {
  db,
  firebaseConfigError,
  firebaseEnabled,
} from '@/config/firebase/client';
import {
  calculateMatchResult,
  getMvpSummary,
} from '@/lib/match';
import {
  TEAM_ACCESS_PERMISSION_MESSAGE,
  USER_ACCOUNT_PERMISSION_MESSAGE,
} from '@/constants/access-notices';
import {
  buildMatchFieldCost,
  buildMatchFieldPayment,
  getMatchFieldPaymentSummary,
} from '@/lib/field-cost';
import {
  normalizeDiaryTitle,
  resolveDiaryEmoji,
  sortMatchDiaryEntries,
  validateDiaryFields,
} from '@/lib/match-diary';
import { buildLegacyMatchImportPreview } from '@/lib/match-import';
import {
  buildInactivatedPlayerState,
  buildReactivatedPlayerState,
  buildUnlinkedPlayerState,
  touchesRestrictedPlayerAdminFields,
} from '@/lib/player-management';
import {
  buildRatingCriteriaSnapshot,
  calculateOverallFromCriteriaScores,
  countRatingCriterionUsage,
  createDefaultTeamRatingCriteria,
  getActiveRatingCriteria,
  normalizeRatingCriteriaOrder,
  normalizeTeamRatingCriterion,
  validateActiveRatingCriteria,
  validateRatingCriteriaSubmission,
} from '@/lib/rating-criteria';
import {
  isPlayerAvailableForLinking,
  membershipIndicatesPlayer,
  normalizeEmail,
  resolvePlayerForUser,
  resolvePlayerForUserWithDiagnostics,
} from '@/lib/player-linking';
import { normalizeTeamMemberStatus } from '@/lib/team-membership';
import {
  buildNotificationId,
  createAttendanceNotification,
  createMatchDiaryPublishedNotification,
  createLineupPublishedNotification,
  createMatchCreatedNotification,
  createMatchFinishedNotification,
  createMatchUpdatedNotification,
  createMvpVotingOpenedNotification,
  createMvpWinnerNotification,
  createRatingsOpenedNotification,
} from '@/lib/notifications';
import {
  canCreateTeamFromOwnedTeamsCount,
  createEmptyManualStats,
  createInviteCode,
  deriveNickname,
  displayNameFromEmail,
  getOwnedTeamsCount as getOwnedTeamsCountFromTeams,
  normalizeInviteCode,
  normalizeManualStats,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
  slugifyTeamName,
} from '@/lib/team';
import {
  TEAM_STORAGE_CLEANUP_WARNING_CODE,
  TEAM_STORAGE_CLEANUP_WARNING_MESSAGE,
} from '@/lib/team-deletion';
import {
  buildPublicTeamDocument,
  buildTeamInviteDocument,
  normalizeTeamPublicProfileFields,
  validateTeamPublicProfileFields,
} from '@/lib/public-team';
import {
  buildTeamMembershipIndexDocument,
  normalizeTeamMembershipIndexDocument,
  TEAM_MEMBERSHIP_INDEX_MEMBERS_SUBCOLLECTION,
} from '@/lib/team-membership-index';
import { deleteTeamStorageAssets } from '@/lib/team-storage';
import { authService } from '@/services/auth';
import type { AuthSessionUser } from '@/services/auth';
import {
  type FirestoreAttendanceDocument,
  type FirestoreLineupDocument,
  type FirestoreMatchDocument,
  type FirestoreMatchDiaryEntryDocument,
  type FirestoreMatchStatDocument,
  type FirestoreMvpVoteDocument,
  type FirestoreNotificationDocument,
  type FirestorePublicTeamDocument,
  type FirestorePlayerRatingDocument,
  FIRESTORE_COLLECTIONS,
  type FirestorePlayerDocument,
  type FirestoreTeamMembershipIndexDocument,
  type FirestoreTeamRatingCriterionDocument,
  type FirestoreTeamInviteDocument,
  type FirestoreSeasonDocument,
  type FirestoreTeamDocument,
  type FirestoreTeamMemberDocument,
  type FirestoreUserDocument,
} from '@/types/firestore';
import type {
  AppNotification,
  AttendanceRecord,
  MatchType,
  Lineup,
  Match,
  MatchDiaryEntry,
  MatchStat,
  MvpVote,
  Player,
  PlayerRating,
  PublicTeamProfile,
  PublicTeamSummary,
  Season,
  Team,
  TeamMember,
  TeamRatingCriterion,
  User,
} from '@/types/domain';

import {
  emptySnapshot,
  type AppRepository,
  type AppSnapshot,
  type CreatePlayerInput,
  type CreateRatingCriterionInput,
  type CreateTeamInput,
  type CreateMatchInput,
  type CreateMatchDiaryEntryInput,
  type FinishMatchInput,
  type GoogleLoginInput,
  type RegisterFinishedMatchInput,
  type SaveLineupInput,
  type SubmitMvpVoteInput,
  type SubmitPlayerRatingInput,
  type SnapshotSubscriptionHandlers,
  type UpdateAttendanceInput,
  type UpdateMatchInput,
  type UpdateMatchFieldPaymentInput,
  type UpdateMatchDiaryEntryInput,
  type UpdateRatingCriterionInput,
  type UpdateTeamInput,
  type UpdatePlayerInput,
} from './types';
import type {
  ImportLegacyMatchesResult,
  ImportedMatchPayloadItem,
  LegacyMatchImportPreview,
  RegisterFinishedMatchPlayerInput,
} from '@/types/match-import';

const firestoreErrorMessages: Record<string, string> = {
  cancelled: 'A operacao foi cancelada. Tente novamente.',
  'already-exists': 'Esse registro ja existe.',
  'not-found': 'Não encontramos o registro solicitado.',
  'permission-denied': 'Você não tem permissão para concluir esta ação.',
  unavailable: 'Servico indisponivel no momento. Tente novamente em instantes.',
  'failed-precondition':
    'Ainda falta um ajuste para concluir esta acao.',
  aborted: 'A operacao foi interrompida por conflito. Tente novamente.',
  'deadline-exceeded':
    'A conexao demorou demais. Tente novamente.',
  'resource-exhausted':
    'Limite temporario atingido. Aguarde e tente novamente.',
  internal: 'Ocorreu um erro interno. Tente novamente.',
};

const FIRESTORE_BATCH_WRITE_LIMIT = 450;
const LOST_TEAM_ACCESS_MESSAGE =
  'Você não tem mais acesso a este time. Escolha ou crie outro time.';

type RepositoryErrorContext = {
  collection?: string;
  operation?: string;
  query?: string;
  teamId?: string | null;
  userId?: string | null;
  [key: string]: unknown;
};

type ErrorWithCode = Error & {
  code?: string;
  cause?: unknown;
  context?: RepositoryErrorContext;
  originalMessage?: string;
  partialSnapshot?: AppSnapshot;
};

type BootstrapTraceContext = {
  userId: string | null;
  activeTeamId: string | null;
};

type LegacyCompatibleUserDocument = Partial<FirestoreUserDocument> &
  Pick<FirestoreUserDocument, 'id' | 'email' | 'displayName' | 'createdAt' | 'updatedAt'> & {
    role?: 'admin' | 'player';
    pushTokens?: string[] | null;
  };

interface RealtimeSnapshotState {
  user: User | null;
  memberships: TeamMember[];
  teamsById: Map<string, Team>;
  ratingCriteria: TeamRatingCriterion[];
  players: Player[];
  matches: Match[];
  lineups: Lineup[];
  attendance: AttendanceRecord[];
  matchStats: MatchStat[];
  matchDiaryEntries: MatchDiaryEntry[];
  mvpVotes: MvpVote[];
  playerRatings: PlayerRating[];
  notifications: AppNotification[];
  seasons: Season[];
  accessNotice: string | null;
}

interface FirestoreBatchMutation {
  type: 'delete' | 'set';
  ref: DocumentReference<DocumentData>;
  data?: DocumentData;
}

const bootstrapTraceStack: BootstrapTraceContext[] = [];

function applyFirestoreBatchMutation(
  batch: ReturnType<typeof writeBatch>,
  mutation: FirestoreBatchMutation,
) {
  if (mutation.type === 'delete') {
    batch.delete(mutation.ref);
    return;
  }

  batch.set(mutation.ref, mutation.data!);
}

function extractErrorCode(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return (error as ErrorWithCode).code?.replace(/^firestore\//, '');
}

function mergeErrorContext(
  current?: RepositoryErrorContext,
  next?: RepositoryErrorContext,
) {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return {
    ...current,
    ...next,
  };
}

function attachErrorContext<TError>(error: TError, context?: RepositoryErrorContext) {
  if (!context || !(error instanceof Error)) {
    return error;
  }

  const repositoryError = error as ErrorWithCode;
  repositoryError.context = mergeErrorContext(repositoryError.context, context);
  return repositoryError as TError;
}

function getCurrentBootstrapTrace() {
  return bootstrapTraceStack[bootstrapTraceStack.length - 1] ?? null;
}

function buildBootstrapLogPayload(context?: RepositoryErrorContext) {
  const trace = getCurrentBootstrapTrace();

  return {
    collection: context?.collection ?? 'unknown',
    operation: context?.operation ?? context?.query ?? undefined,
    teamId: context?.teamId ?? trace?.activeTeamId ?? null,
    userId: context?.userId ?? trace?.userId ?? null,
  };
}

function logBootstrapFirestore(
  event:
    | 'start'
    | 'currentUser'
    | 'activeTeamId'
    | 'no-active-team'
    | 'safe-empty-snapshot'
    | 'query-start'
    | 'query-success'
    | 'query-error',
  payload?: unknown,
) {
  if (!__DEV__) {
    return;
  }

  const logger = event === 'query-error' ? console.error : console.log;

  if (payload === undefined) {
    logger(`[bootstrap-firestore] ${event}`);
    return;
  }

  try {
    logger(
      `[bootstrap-firestore] ${event}`,
      typeof payload === 'string' ||
        typeof payload === 'number' ||
        typeof payload === 'boolean' ||
        payload === null
        ? String(payload)
        : JSON.stringify(payload, null, 2),
    );
  } catch {
    logger(`[bootstrap-firestore] ${event}`, String(payload));
  }
}

function logAuthLink(
  event:
    | 'user-doc'
    | 'active-team'
    | 'memberships'
    | 'repair-active-team'
    | 'permission-denied',
  payload?: unknown,
) {
  if (!__DEV__) {
    return;
  }

  const logger = event === 'permission-denied' ? console.warn : console.log;

  if (payload === undefined) {
    logger(`[auth-link] ${event}`);
    return;
  }

  try {
    logger(
      `[auth-link] ${event}`,
      typeof payload === 'string' ||
        typeof payload === 'number' ||
        typeof payload === 'boolean' ||
        payload === null
        ? String(payload)
        : JSON.stringify(payload, null, 2),
    );
  } catch {
    logger(`[auth-link] ${event}`, String(payload));
  }
}

async function withBootstrapTrace<T>(
  trace: BootstrapTraceContext,
  action: () => Promise<T>,
) {
  bootstrapTraceStack.push(trace);

  try {
    logBootstrapFirestore('start');
    logBootstrapFirestore('currentUser', trace.userId);
    logBootstrapFirestore('activeTeamId', trace.activeTeamId);
    return await action();
  } finally {
    bootstrapTraceStack.pop();
  }
}

async function runLoggedBootstrapQuery<T>(
  context: RepositoryErrorContext,
  action: () => Promise<T>,
  options?: {
    count?: (result: T) => number;
  },
) {
  const trace = getCurrentBootstrapTrace();

  if (!trace) {
    return await action();
  }

  const startPayload = buildBootstrapLogPayload(context);
  logBootstrapFirestore('query-start', startPayload);

  try {
    const result = await action();
    const count =
      options?.count?.(result) ??
      (Array.isArray(result) ? result.length : result == null ? 0 : 1);
    logBootstrapFirestore('query-success', {
      collection: startPayload.collection,
      operation: startPayload.operation,
      teamId: startPayload.teamId,
      userId: startPayload.userId,
      count,
    });
    return result;
  } catch (error) {
    const normalizedError = attachErrorContext(error, context);
    logBootstrapFirestore('query-error', {
      ...startPayload,
      code: extractErrorCode(normalizedError) ?? 'unknown',
      message:
        normalizedError instanceof Error ? normalizedError.message : 'Erro desconhecido.',
    });
    throw normalizedError;
  }
}

function createRepositoryError(
  message: string,
  code = 'repository/custom-error',
  options?: {
    cause?: unknown;
    context?: RepositoryErrorContext;
    partialSnapshot?: AppSnapshot;
  },
) {
  const error = new Error(message) as ErrorWithCode;
  const causeAsError =
    options?.cause instanceof Error ? (options.cause as ErrorWithCode) : undefined;
  error.code = code;
  error.context = options?.context;
  error.cause = options?.cause;
  error.originalMessage = causeAsError?.message;
  error.partialSnapshot = options?.partialSnapshot ?? causeAsError?.partialSnapshot;

  if (causeAsError?.stack) {
    error.stack = causeAsError.stack;
  }

  return error;
}

function toFriendlyFirestoreError(
  error: unknown,
  fallbackMessage: string,
  context?: RepositoryErrorContext,
) {
  if (error instanceof Error) {
    const repositoryError = error as ErrorWithCode;
    const code = extractErrorCode(error);
    const nextContext = mergeErrorContext(repositoryError.context, context);

    if (code && firestoreErrorMessages[code]) {
      return createRepositoryError(firestoreErrorMessages[code], code, {
        cause: error,
        context: nextContext,
        partialSnapshot: repositoryError.partialSnapshot,
      });
    }

    if (error.message) {
      return createRepositoryError(error.message, code, {
        cause: error,
        context: nextContext,
        partialSnapshot: repositoryError.partialSnapshot,
      });
    }
  }

  return createRepositoryError(fallbackMessage, 'repository/custom-error', {
    cause: error,
    context,
    partialSnapshot:
      error instanceof Error ? (error as ErrorWithCode).partialSnapshot : undefined,
  });
}

function createTeamDeletionStorageWarningError() {
  return createRepositoryError(
    TEAM_STORAGE_CLEANUP_WARNING_MESSAGE,
    TEAM_STORAGE_CLEANUP_WARNING_CODE,
  );
}

function nowIso() {
  return new Date().toISOString();
}

function buildStableDocumentId(...parts: string[]) {
  return parts.join('__');
}

function normalizeMatchTime(time?: string | null) {
  return time?.trim() ?? '';
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function hasAssignedId(value?: string | null) {
  return normalizeOptionalString(value) != null;
}

function buildCurrentUserSeedDocument(sessionUser: AuthSessionUser, now: string) {
  const email = normalizeEmail(sessionUser.email);
  const displayName =
    sessionUser.displayName.trim() || displayNameFromEmail(email);
  const avatarUrl = sessionUser.avatarUrl?.trim() || null;

  return normalizeUserDocument({
    id: sessionUser.authId,
    email,
    displayName,
    appRole: 'player',
    canCreateTeam: false,
    activeTeamId: null,
    teamId: null,
    playerId: null,
    avatarUrl,
    notificationTokens: [],
    createdAt: now,
    updatedAt: now,
  });
}

function normalizeMatchVenue(venue?: string | null) {
  return venue?.trim() || 'Não informado';
}

function defaultLinePlayersCount(matchType: MatchType) {
  switch (matchType) {
    case 'futsal':
      return 4;
    case 'field':
      return 10;
    case 'society':
    case 'training':
    default:
      return 6;
  }
}

function sanitizeSecondaryPositions(
  primaryPosition: Player['primaryPosition'],
  secondaryPositions: Player['secondaryPositions'],
) {
  return [...new Set(secondaryPositions)].filter(
    (position) => position !== primaryPosition,
  );
}

function allowedSelfUpdateFields(input: UpdatePlayerInput) {
  const allowedKeys = new Set([
    'photoUrl',
    'nickname',
    'bio',
    'jerseyNumber',
    'secondaryPositions',
    'dominantFoot',
    'preferredPosition',
    'introVideoUrl',
    'celebrationVideoUrl',
  ]);

  const invalid = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (invalid.length > 0) {
    throw createRepositoryError(
      'Seu perfil permite editar apenas foto, apelido, bio, posicoes, pe dominante e os videos do jogador.',
      'permission-denied',
    );
  }
}

function requireFirestore() {
  if (!firebaseEnabled || !db) {
    throw createRepositoryError(
      firebaseConfigError ??
        'Os dados da conta ainda não estão prontos para uso.',
      'configuration-error',
    );
  }

  return db;
}

function parseDoc<T extends { id: string }>(
  snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
) {
  const data = snapshot.data();

  if (!data) {
    throw createRepositoryError('Documento não encontrado.', 'not-found');
  }

  return {
    ...data,
    id: snapshot.id,
  } as T;
}

function normalizeUserDocument(
  user: LegacyCompatibleUserDocument,
): FirestoreUserDocument {
  const { role: _legacyRole, ...rest } = user;
  const resolvedAppRole =
    user.appRole ?? (user.role === 'admin' ? 'team_admin' : 'player');
  const resolvedActiveTeamId = user.activeTeamId ?? user.teamId ?? null;

  return {
    ...rest,
    appRole: resolvedAppRole,
    canCreateTeam:
      user.canCreateTeam ?? (resolvedAppRole === 'owner' || resolvedAppRole === 'team_admin'),
    activeTeamId: resolvedActiveTeamId,
    teamId: user.teamId ?? null,
    playerId: user.playerId ?? null,
    avatarUrl: user.avatarUrl ?? null,
    notificationTokens: [...new Set(user.notificationTokens ?? user.pushTokens ?? [])],
  } as FirestoreUserDocument;
}

function normalizeTeamMemberDocument(
  membership: FirestoreTeamMemberDocument,
): FirestoreTeamMemberDocument {
  const uniqueRoles = [...new Set(membership.roles ?? [])];

  return {
    ...membership,
    playerId: membership.playerId ?? null,
    inviteCodeUsed: membership.inviteCodeUsed ? normalizeInviteCode(membership.inviteCodeUsed) : null,
    roles: uniqueRoles,
    canManageTeam:
      membership.canManageTeam ?? uniqueRoles.includes('admin'),
    canManagePlayers:
      membership.canManagePlayers ?? uniqueRoles.includes('admin'),
    joinedAt: membership.joinedAt ?? membership.createdAt,
    status: normalizeTeamMemberStatus(membership.status),
  };
}

function normalizeTeamDocument(
  team: FirestoreTeamDocument,
): FirestoreTeamDocument {
  return {
    ...team,
    logoUrl: team.logoUrl ?? null,
    bannerUrl: team.bannerUrl ?? null,
    presentationVideoUrl: team.presentationVideoUrl ?? null,
    accentColor: team.accentColor ?? null,
    description: team.description ?? '',
    inviteCode: team.inviteCode ?? '',
    inviteCodeUpdatedAt: team.inviteCodeUpdatedAt ?? team.updatedAt,
    activeSeasonId: team.activeSeasonId ?? null,
    isPublic: team.isPublic ?? false,
    city: team.city?.trim() ?? null,
    state: team.state?.trim().toUpperCase() ?? null,
    neighborhood: team.neighborhood?.trim() ?? null,
    homeFieldName: team.homeFieldName?.trim() ?? null,
    contactName: team.contactName?.trim() ?? null,
    contactPhone: team.contactPhone?.trim() ?? null,
    contactWhatsapp: team.contactWhatsapp?.trim() ?? null,
    publicDescription: team.publicDescription?.trim() ?? null,
    allowFriendlyContact: team.allowFriendlyContact ?? false,
    publicRosterEnabled: team.publicRosterEnabled ?? false,
  };
}

function normalizePublicTeamDocument(
  team: FirestorePublicTeamDocument,
): FirestorePublicTeamDocument {
  return {
    ...team,
    logoUrl: team.logoUrl ?? null,
    bannerUrl: team.bannerUrl ?? null,
    accentColor: team.accentColor ?? null,
    neighborhood: team.neighborhood?.trim() ?? null,
    homeFieldName: team.homeFieldName?.trim() ?? null,
    publicDescription: team.publicDescription?.trim() ?? null,
    contactName: team.contactName?.trim() ?? null,
    contactPhone: team.contactPhone?.trim() ?? null,
    contactWhatsapp: team.contactWhatsapp?.trim() ?? null,
    presentationVideoUrl: team.presentationVideoUrl ?? null,
    publicRosterEnabled: team.publicRosterEnabled ?? false,
    roster: team.roster ?? [],
  };
}

function normalizeTeamInviteDocument(
  invite: FirestoreTeamInviteDocument,
): FirestoreTeamInviteDocument {
  return {
    ...invite,
    code: normalizeInviteCode(invite.code),
    teamLogoUrl: invite.teamLogoUrl ?? null,
    accentColor: invite.accentColor ?? null,
  };
}

function toPublicTeamSummary(team: FirestorePublicTeamDocument): PublicTeamSummary {
  const {
    presentationVideoUrl: _presentationVideoUrl,
    publicRosterEnabled: _publicRosterEnabled,
    roster: _roster,
    adminUserId: _adminUserId,
    sourceTeamUpdatedAt: _sourceTeamUpdatedAt,
    syncedAt: _syncedAt,
    ...summary
  } = team;

  return summary;
}

function toPublicTeamProfile(team: FirestorePublicTeamDocument): PublicTeamProfile {
  const {
    adminUserId: _adminUserId,
    sourceTeamUpdatedAt: _sourceTeamUpdatedAt,
    syncedAt: _syncedAt,
    ...profile
  } = team;

  return profile;
}

function buildTeamMembershipIndexRef(firestore: ReturnType<typeof requireFirestore>, teamId: string, userId: string) {
  return doc(
    firestore,
    FIRESTORE_COLLECTIONS.teamMembershipIndex,
    teamId,
    TEAM_MEMBERSHIP_INDEX_MEMBERS_SUBCOLLECTION,
    userId,
  );
}

function buildTeamMembershipIndexMutation(membership: TeamMember) {
  const firestore = requireFirestore();
  const ref = buildTeamMembershipIndexRef(firestore, membership.teamId, membership.userId);

  if (membership.status !== 'active') {
    return {
      type: 'delete' as const,
      ref,
    };
  }

  return {
    type: 'set' as const,
    ref,
    data: buildTeamMembershipIndexDocument(membership),
  };
}

function buildTeamMembershipIndexDeleteMutation(teamId: string, userId: string) {
  const firestore = requireFirestore();

  return {
    type: 'delete' as const,
    ref: buildTeamMembershipIndexRef(firestore, teamId, userId),
  };
}

function normalizePlayerDocument(
  player: FirestorePlayerDocument,
): FirestorePlayerDocument {
  return {
    ...player,
    linkedUserId: player.linkedUserId ?? null,
    linkedEmail: player.linkedEmail ? normalizeEmail(player.linkedEmail) : null,
    photoUrl: player.photoUrl ?? null,
    presentationVideoUrl: player.presentationVideoUrl ?? null,
    secondaryPositions: player.secondaryPositions ?? [],
    bio: player.bio ?? '',
    preferredPosition: player.preferredPosition ?? null,
    allowSelfEditJerseyNumber: player.allowSelfEditJerseyNumber ?? false,
    introVideoUrl: player.introVideoUrl ?? null,
    celebrationVideoUrl: player.celebrationVideoUrl ?? null,
    manualStats: normalizeManualStats(player.manualStats),
    deletedAt: player.deletedAt ?? null,
  };
}

function normalizeMatchDocument(
  match: FirestoreMatchDocument,
): FirestoreMatchDocument {
  return {
    ...match,
    seasonId: match.seasonId ?? null,
    locationUrl: match.locationUrl ?? null,
    opponentLogoUrl: match.opponentLogoUrl ?? null,
    opponentTeamId: match.opponentTeamId ?? null,
    opponentTeamName: match.opponentTeamName ?? null,
    opponentTeamLogoUrl: match.opponentTeamLogoUrl ?? null,
    opponentSource: match.opponentSource ?? null,
    notes: match.notes ?? '',
    scoreboard: match.scoreboard
      ? {
          ...match.scoreboard,
          ownGoalsForTeam: match.scoreboard.ownGoalsForTeam ?? 0,
        }
      : null,
    fieldCost: match.fieldCost
      ? {
          ...match.fieldCost,
          totalAmount: Number(match.fieldCost.totalAmount ?? 0),
          splitCount: Number(match.fieldCost.splitCount ?? 0),
          amountPerPlayer: Number(match.fieldCost.amountPerPlayer ?? 0),
          currency: 'BRL',
          note: match.fieldCost.note?.trim() || null,
          updatedAt: match.fieldCost.updatedAt ?? match.updatedAt,
          updatedByUserId: match.fieldCost.updatedByUserId ?? undefined,
        }
      : null,
    fieldPayment: match.fieldPayment
      ? {
          ...match.fieldPayment,
          payerPlayerIds: [...new Set(match.fieldPayment.payerPlayerIds ?? [])],
          paidGuestCount: Math.max(0, Math.trunc(match.fieldPayment.paidGuestCount ?? 0)),
          pixKey: match.fieldPayment.pixKey?.trim() || null,
          responsibleName: match.fieldPayment.responsibleName?.trim() || null,
          updatedAt: match.fieldPayment.updatedAt ?? match.updatedAt,
          updatedByUserId: match.fieldPayment.updatedByUserId ?? undefined,
        }
      : null,
    finishedAt: match.finishedAt ?? null,
    mvpWinnerPlayerIds: match.mvpWinnerPlayerIds ?? [],
    mvpTotalVotes: match.mvpTotalVotes ?? 0,
  };
}

function isActivePlayer(player: Player) {
  return player.status !== 'inactive' && !player.deletedAt;
}

function normalizeTeamRatingCriterionDocument(
  criterion: FirestoreTeamRatingCriterionDocument,
): FirestoreTeamRatingCriterionDocument {
  return normalizeTeamRatingCriterion({
    ...criterion,
    description: criterion.description ?? null,
  });
}

function normalizeLineupDocument(
  lineup: FirestoreLineupDocument,
): FirestoreLineupDocument {
  return {
    ...lineup,
    starters: lineup.starters ?? [],
    benchPlayerIds: lineup.benchPlayerIds ?? [],
  };
}

function normalizeAttendanceDocument(
  attendance: FirestoreAttendanceDocument,
): FirestoreAttendanceDocument {
  return {
    ...attendance,
    userId: attendance.userId ?? null,
    respondedAt: attendance.respondedAt ?? null,
  };
}

function normalizeMatchStatDocument(
  matchStat: FirestoreMatchStatDocument,
): FirestoreMatchStatDocument {
  return {
    ...matchStat,
    started: matchStat.started ?? false,
    yellowCards: matchStat.yellowCards ?? 0,
    redCards: matchStat.redCards ?? 0,
    notes: matchStat.notes ?? '',
  };
}

function normalizeMatchDiaryEntryDocument(
  entry: FirestoreMatchDiaryEntryDocument,
): FirestoreMatchDiaryEntryDocument {
  return {
    ...entry,
    title: normalizeDiaryTitle(entry.title),
    content: entry.content.trim(),
    mentionedPlayerIds: [...new Set(entry.mentionedPlayerIds ?? [])],
    visibility: 'team',
    pinned: entry.pinned ?? false,
    mood: entry.mood ?? null,
    emoji: resolveDiaryEmoji(entry.mood, entry.emoji),
  };
}

function normalizeMvpVoteDocument(
  vote: FirestoreMvpVoteDocument,
): FirestoreMvpVoteDocument {
  return vote;
}

function normalizePlayerRatingDocument(
  rating: FirestorePlayerRatingDocument,
): FirestorePlayerRatingDocument {
  const criteria = Object.entries(rating.criteria ?? {}).reduce<Record<string, number>>(
    (acc, [key, value]) => {
      acc[key] = Number(value);
      return acc;
    },
    {},
  );
  const criteriaScores = Object.entries(rating.criteriaScores ?? {}).reduce<Record<string, number>>(
    (acc, [key, value]) => {
      acc[key] = Number(value);
      return acc;
    },
    {},
  );
  const criteriaSnapshot = Object.entries(rating.criteriaSnapshot ?? {}).reduce<
    NonNullable<FirestorePlayerRatingDocument['criteriaSnapshot']>
  >((acc, [criterionId, item]) => {
    acc[criterionId] = {
      criterionId,
      label: item?.label ?? criterionId,
      type: item?.type ?? 'positive',
      weight: Number(item?.weight ?? 1),
      order: Number(item?.order ?? 0),
    };
    return acc;
  }, {});

  return {
    ...rating,
    criteria,
    criteriaScores,
    criteriaSnapshot,
    overall: Number(rating.overall ?? 0),
  };
}

function normalizeNotificationDocument(
  notification: FirestoreNotificationDocument,
): FirestoreNotificationDocument {
  return {
    ...notification,
    matchId: notification.matchId ?? null,
    playerId: notification.playerId ?? null,
    entryId: notification.entryId ?? null,
    actorUserId: notification.actorUserId ?? null,
    targetUserId: notification.targetUserId ?? null,
    readByUserIds: [...new Set(notification.readByUserIds ?? [])],
  };
}

function canAccessNotification(
  notification: AppNotification,
  userId: string | null | undefined,
) {
  return notification.targetUserId == null || notification.targetUserId === userId;
}

async function fetchUserById(userId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.users,
      operation: 'get-by-id',
      userId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDoc(doc(firestore, FIRESTORE_COLLECTIONS.users, userId));
    },
  );

  if (!snapshot.exists()) {
    throw createRepositoryError('Usuário não encontrado.', 'not-found');
  }

  return normalizeUserDocument(parseDoc<FirestoreUserDocument>(snapshot));
}

async function fetchUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  try {
    const firestore = requireFirestore();
    const snapshot = await getDocs(
      query(
        collection(firestore, FIRESTORE_COLLECTIONS.users),
        where('email', '==', normalizedEmail),
      ),
    );
    const userDocument = snapshot.docs[0];

    if (!userDocument) {
      return null;
    }

    return normalizeUserDocument(parseDoc<FirestoreUserDocument>(userDocument));
  } catch (error) {
    throw attachErrorContext(error, {
      collection: FIRESTORE_COLLECTIONS.users,
      operation: 'where-email',
      query: 'fetchUserByEmail',
    });
  }
}

async function fetchTeamById(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.teams,
      query: 'fetchTeamById',
      teamId,
    },
    async () => await getDoc(doc(firestore, FIRESTORE_COLLECTIONS.teams, teamId)),
  );

  if (!snapshot.exists()) {
    throw createRepositoryError('Time não encontrado.', 'not-found');
  }

  return normalizeTeamDocument(parseDoc<FirestoreTeamDocument>(snapshot));
}

async function fetchPlayerByIdForTeam(teamId: string, playerId: string) {
  const player = (await fetchPlayersByTeamId(teamId)).find((item) => item.id === playerId);

  if (!player) {
    throw createRepositoryError('Jogador não encontrado.', 'not-found');
  }

  return player;
}

async function fetchMatchByIdForTeam(teamId: string, matchId: string) {
  const match = (await fetchMatchesByTeamId(teamId)).find((item) => item.id === matchId);

  if (!match) {
    throw createRepositoryError('Partida não encontrada.', 'not-found');
  }

  return match;
}

async function fetchUsersByTeamId(teamId: string) {
  try {
    const firestore = requireFirestore();
    const snapshot = await getDocs(
      query(
        collection(firestore, FIRESTORE_COLLECTIONS.users),
        where('teamId', '==', teamId),
      ),
    );

    return snapshot.docs.map((item) =>
      normalizeUserDocument(parseDoc<FirestoreUserDocument>(item)),
    );
  } catch (error) {
    throw attachErrorContext(error, {
      collection: FIRESTORE_COLLECTIONS.users,
      operation: 'where-teamId',
      query: 'fetchUsersByTeamId',
      teamId,
    });
  }
}

async function fetchTeamMembersByUserId(userId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.teamMembers,
      operation: 'where-userId',
      userId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.teamMembers),
          where('userId', '==', userId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeTeamMemberDocument(parseDoc<FirestoreTeamMemberDocument>(item)),
  );
}

async function fetchTeamMembersByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.teamMembers,
      query: 'fetchTeamMembersByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.teamMembers),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeTeamMemberDocument(parseDoc<FirestoreTeamMemberDocument>(item)),
  );
}

async function fetchTeamMemberByUserAndTeam(userId: string, teamId: string) {
  const memberships = sortMembershipsByPriority(
    (await fetchTeamMembersByUserId(userId)).filter(
      (membership) => membership.teamId === teamId,
    ),
  );

  return memberships.find((membership) => membership.status === 'active') ?? memberships[0] ?? null;
}

async function fetchTeamsByIds(teamIds: string[]) {
  const uniqueTeamIds = [...new Set(teamIds)].filter(Boolean);
  const teams = await Promise.all(uniqueTeamIds.map((teamId) => fetchTeamById(teamId)));
  return teams.sort((left, right) => left.name.localeCompare(right.name));
}

async function fetchAccessibleTeamsResultByIds(teamIds: string[], userId: string) {
  const uniqueTeamIds = [...new Set(teamIds)].filter(Boolean);
  const blockedTeamIds: string[] = [];
  const teams = (
    await Promise.all(
      uniqueTeamIds.map(async (teamId) => {
        try {
          return await fetchTeamById(teamId);
        } catch (error) {
          const code = extractErrorCode(error);

          if (code === 'permission-denied') {
            blockedTeamIds.push(teamId);
            logAuthLink('permission-denied', {
              stage: 'fetch-team-by-id',
              userId,
              teamId,
              code,
              message: error instanceof Error ? error.message : 'Erro desconhecido.',
              context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
            });
            return null;
          }

          if (code === 'not-found') {
            return null;
          }

          throw error;
        }
      }),
    )
  )
    .filter((team): team is Team => team != null)
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    teams,
    blockedTeamIds,
  };
}

async function getOwnedTeamsCount(userId: string) {
  const memberships = sortMembershipsByPriority(await fetchTeamMembersByUserId(userId)).filter(
    (membership) => membership.status === 'active' && membership.roles.includes('admin'),
  );

  if (memberships.length === 0) {
    return 0;
  }

  const { teams } = await fetchAccessibleTeamsResultByIds(
    memberships.map((membership) => membership.teamId),
    userId,
  );

  return getOwnedTeamsCountFromTeams(teams, userId);
}

async function fetchPlayersByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.players,
      query: 'fetchPlayersByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.players),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizePlayerDocument(parseDoc<FirestorePlayerDocument>(item)),
  );
}

async function fetchPlayersByLinkedUserId(userId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.players,
      query: 'fetchPlayersByLinkedUserId',
      userId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.players),
          where('linkedUserId', '==', userId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizePlayerDocument(parseDoc<FirestorePlayerDocument>(item)),
  );
}

async function fetchPlayersByLinkedEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return [] as FirestorePlayerDocument[];
  }

  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.players,
      query: 'fetchPlayersByLinkedEmail',
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.players),
          where('linkedEmail', '==', normalizedEmail),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizePlayerDocument(parseDoc<FirestorePlayerDocument>(item)),
  );
}

async function fetchMatchesByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.matches,
      query: 'fetchMatchesByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.matches),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeMatchDocument(parseDoc<FirestoreMatchDocument>(item)),
  );
}

async function fetchLineupsByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.lineups,
      query: 'fetchLineupsByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.lineups),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeLineupDocument(parseDoc<FirestoreLineupDocument>(item)),
  );
}

async function fetchLineupByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchLineupsByTeamId(teamId)).find((item) => item.matchId === matchId) ?? null;
}

async function fetchAttendanceByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.attendance,
      query: 'fetchAttendanceByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.attendance),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeAttendanceDocument(parseDoc<FirestoreAttendanceDocument>(item)),
  );
}

async function fetchAttendanceByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchAttendanceByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchMatchStatsByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.matchStats,
      query: 'fetchMatchStatsByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.matchStats),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeMatchStatDocument(parseDoc<FirestoreMatchStatDocument>(item)),
  );
}

async function fetchMatchStatsByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchMatchStatsByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchMatchDiaryEntriesByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.matchDiaryEntries,
      query: 'fetchMatchDiaryEntriesByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.matchDiaryEntries),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return sortMatchDiaryEntries(
    snapshot.docs.map((item) =>
      normalizeMatchDiaryEntryDocument(parseDoc<FirestoreMatchDiaryEntryDocument>(item)),
    ),
  );
}

async function fetchMatchDiaryEntriesByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchMatchDiaryEntriesByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchMatchDiaryEntryByIdForTeam(teamId: string, entryId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(
    doc(firestore, FIRESTORE_COLLECTIONS.matchDiaryEntries, entryId),
  );

  if (!snapshot.exists()) {
    return null;
  }

  const entry = normalizeMatchDiaryEntryDocument(
    parseDoc<FirestoreMatchDiaryEntryDocument>(snapshot),
  );

  if (entry.teamId !== teamId) {
    throw createRepositoryError(
      'Essa resenha não pertence ao time atual.',
      'permission-denied',
    );
  }

  return entry;
}

async function fetchMvpVotesByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.mvpVotes,
      query: 'fetchMvpVotesByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.mvpVotes),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeMvpVoteDocument(parseDoc<FirestoreMvpVoteDocument>(item)),
  );
}

async function fetchMvpVotesByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchMvpVotesByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchRatingCriteriaByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.ratingCriteria,
      query: 'fetchRatingCriteriaByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.ratingCriteria),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return normalizeRatingCriteriaOrder(
    snapshot.docs.map((item) =>
      normalizeTeamRatingCriterionDocument(parseDoc<FirestoreTeamRatingCriterionDocument>(item)),
    ),
  );
}

async function fetchRatingCriterionByIdForTeam(teamId: string, criterionId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(
    doc(firestore, FIRESTORE_COLLECTIONS.ratingCriteria, criterionId),
  );

  if (!snapshot.exists()) {
    return null;
  }

  const criterion = normalizeTeamRatingCriterionDocument(
    parseDoc<FirestoreTeamRatingCriterionDocument>(snapshot),
  );

  if (criterion.teamId !== teamId) {
    throw createRepositoryError(
      'Esse critério não pertence ao time atual.',
      'permission-denied',
    );
  }

  return criterion;
}

async function fetchPlayerRatingsByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.playerRatings,
      query: 'fetchPlayerRatingsByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.playerRatings),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizePlayerRatingDocument(parseDoc<FirestorePlayerRatingDocument>(item)),
  );
}

async function fetchPlayerRatingsByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchPlayerRatingsByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchAllNotificationsByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.notifications,
      query: 'fetchAllNotificationsByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.notifications),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) =>
    normalizeNotificationDocument(parseDoc<FirestoreNotificationDocument>(item)),
  );
}

function dedupeNotifications(notifications: AppNotification[]) {
  return [...new Map(notifications.map((notification) => [notification.id, notification])).values()];
}

async function fetchAccessibleNotificationsByTeamId(teamId: string, userId: string) {
  const [teamWideSnapshot, targetedSnapshot] = await Promise.all([
    runLoggedBootstrapQuery(
      {
        collection: FIRESTORE_COLLECTIONS.notifications,
        query: 'fetchAccessibleNotificationsByTeamId:teamWide',
        teamId,
        userId,
      },
      async () => {
        const firestore = requireFirestore();
        return await getDocs(
          query(
            collection(firestore, FIRESTORE_COLLECTIONS.notifications),
            where('teamId', '==', teamId),
            where('targetUserId', '==', null),
          ),
        );
      },
    ),
    runLoggedBootstrapQuery(
      {
        collection: FIRESTORE_COLLECTIONS.notifications,
        query: 'fetchAccessibleNotificationsByTeamId:targeted',
        teamId,
        userId,
      },
      async () => {
        const firestore = requireFirestore();
        return await getDocs(
          query(
            collection(firestore, FIRESTORE_COLLECTIONS.notifications),
            where('teamId', '==', teamId),
            where('targetUserId', '==', userId),
          ),
        );
      },
    ),
  ]);

  return dedupeNotifications(
    [...teamWideSnapshot.docs, ...targetedSnapshot.docs].map((item) =>
      normalizeNotificationDocument(parseDoc<FirestoreNotificationDocument>(item)),
    ),
  );
}

async function fetchNotificationByIdForTeam(teamId: string, notificationId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(
    doc(firestore, FIRESTORE_COLLECTIONS.notifications, notificationId),
  );

  if (!snapshot.exists()) {
    return null;
  }

  const notification = normalizeNotificationDocument(
    parseDoc<FirestoreNotificationDocument>(snapshot),
  );

  if (notification.teamId !== teamId) {
    throw createRepositoryError(
      'Essa notificação não pertence ao time atual.',
      'permission-denied',
    );
  }

  return notification;
}

function createDiaryNotificationId(
  entryId: string,
  targetUserId?: string | null,
) {
  return buildNotificationId(
    'match-diary-published',
    entryId,
    targetUserId ? `target-${targetUserId}` : 'team',
  );
}

function buildDiaryNotificationDocuments(input: {
  entry: MatchDiaryEntry;
  match: Match;
  actorUserId: string;
  teamMembers: TeamMember[];
  existingNotifications: AppNotification[];
}) {
  const mentionedPlayerIds = new Set(input.entry.mentionedPlayerIds);
  const activeTeamMembers = input.teamMembers.filter((member) => member.status === 'active');
  const mentionedUserIds = new Set(
    activeTeamMembers
      .filter((member) => member.playerId && mentionedPlayerIds.has(member.playerId))
      .map((member) => member.userId),
  );
  const documents: FirestoreNotificationDocument[] = [];

  if (mentionedUserIds.size === 0) {
    const notificationId = createDiaryNotificationId(input.entry.id);
    const existing = input.existingNotifications.find(
      (notification) => notification.id === notificationId,
    );
    documents.push(
      createMatchDiaryPublishedNotification({
        id: notificationId,
        teamId: input.entry.teamId,
        match: input.match,
        entryId: input.entry.id,
        authorName: input.entry.authorName,
        actorUserId: input.actorUserId,
        createdAt: existing?.createdAt,
        updatedAt: input.entry.updatedAt,
        variant: 'published',
      }),
    );
    return documents;
  }

  const recipientUserIds = [...new Set(activeTeamMembers.map((member) => member.userId))];

  for (const userId of recipientUserIds) {
    const notificationId = createDiaryNotificationId(input.entry.id, userId);
    const existing = input.existingNotifications.find(
      (notification) => notification.id === notificationId,
    );
    documents.push(
      createMatchDiaryPublishedNotification({
        id: notificationId,
        teamId: input.entry.teamId,
        match: input.match,
        entryId: input.entry.id,
        authorName: input.entry.authorName,
        actorUserId: input.actorUserId,
        createdAt: existing?.createdAt,
        updatedAt: input.entry.updatedAt,
        targetUserId: userId,
        variant: mentionedUserIds.has(userId) ? 'mentioned' : 'team',
      }),
    );
  }

  return documents;
}

async function fetchSeasonsByTeamId(teamId: string) {
  const snapshot = await runLoggedBootstrapQuery(
    {
      collection: FIRESTORE_COLLECTIONS.seasons,
      query: 'fetchSeasonsByTeamId',
      teamId,
    },
    async () => {
      const firestore = requireFirestore();
      return await getDocs(
        query(
          collection(firestore, FIRESTORE_COLLECTIONS.seasons),
          where('teamId', '==', teamId),
        ),
      );
    },
  );

  return snapshot.docs.map((item) => parseDoc<FirestoreSeasonDocument>(item)) as Season[];
}

async function fetchPublicTeamById(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(doc(firestore, FIRESTORE_COLLECTIONS.publicTeams, teamId));

  if (!snapshot.exists()) {
    return null;
  }

  return normalizePublicTeamDocument(parseDoc<FirestorePublicTeamDocument>(snapshot));
}

async function fetchTeamInviteByCode(inviteCode: string) {
  const firestore = requireFirestore();
  const normalizedInviteCode = normalizeInviteCode(inviteCode);

  if (!normalizedInviteCode) {
    return null;
  }

  const snapshot = await getDoc(
    doc(firestore, FIRESTORE_COLLECTIONS.teamInvites, normalizedInviteCode),
  );

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeTeamInviteDocument(parseDoc<FirestoreTeamInviteDocument>(snapshot));
}

async function buildPublicTeamProjection(team: Team, syncedAt = nowIso()) {
  const [matches, players] = await Promise.all([
    fetchMatchesByTeamId(team.id),
    team.publicRosterEnabled ? fetchPlayersByTeamId(team.id) : Promise.resolve([] as Player[]),
  ]);

  return buildPublicTeamDocument({
    team,
    matches,
    players,
    syncedAt,
  });
}

function buildPublicTeamSyncMutations(
  teamId: string,
  publicTeam: FirestorePublicTeamDocument | null,
) {
  const firestore = requireFirestore();

  if (!publicTeam) {
    return [
      {
        type: 'delete' as const,
        ref: doc(firestore, FIRESTORE_COLLECTIONS.publicTeams, teamId),
      },
    ];
  }

  return [
    {
      type: 'set' as const,
      ref: doc(firestore, FIRESTORE_COLLECTIONS.publicTeams, teamId),
      data: publicTeam,
    },
  ];
}

function buildTeamInviteSyncMutations(
  team: Team,
  options?: {
    previousInviteCode?: string | null;
  },
) {
  const firestore = requireFirestore();
  const invite = buildTeamInviteDocument(team, team.updatedAt);
  const previousInviteCode = normalizeInviteCode(options?.previousInviteCode ?? '');
  const mutations: FirestoreBatchMutation[] = [];

  if (previousInviteCode && previousInviteCode !== invite.code) {
    mutations.push({
      type: 'delete',
      ref: doc(firestore, FIRESTORE_COLLECTIONS.teamInvites, previousInviteCode),
    });
  }

  mutations.push({
    type: 'set',
    ref: doc(firestore, FIRESTORE_COLLECTIONS.teamInvites, invite.code),
    data: invite,
  });

  return mutations;
}

async function syncPublicTeamProjection(team: Team, syncedAt = nowIso()) {
  const publicTeam = await buildPublicTeamProjection(team, syncedAt);
  await commitFirestoreBatchMutations(buildPublicTeamSyncMutations(team.id, publicTeam));
  return publicTeam;
}

async function loadTeamRatingCriteria(teamId: string) {
  return fetchRatingCriteriaByTeamId(teamId);
}

async function persistTeamRatingCriteria(
  criteria: TeamRatingCriterion[],
  deletedCriterionIds: string[] = [],
) {
  const firestore = requireFirestore();
  const normalizedCriteria = normalizeRatingCriteriaOrder(criteria);
  validateActiveRatingCriteria(normalizedCriteria);
  const batch = writeBatch(firestore);

  for (const criterion of normalizedCriteria) {
    batch.set(
      doc(firestore, FIRESTORE_COLLECTIONS.ratingCriteria, criterion.id),
      criterion,
    );
  }

  for (const criterionId of deletedCriterionIds) {
    batch.delete(doc(firestore, FIRESTORE_COLLECTIONS.ratingCriteria, criterionId));
  }

  await batch.commit();
  return normalizedCriteria;
}

function buildCurrentUserDocumentWithSessionProfile(
  currentUser: User,
  sessionUser: AuthSessionUser,
  now: string,
) {
  const seedUser = buildCurrentUserSeedDocument(sessionUser, currentUser.createdAt);

  return normalizeUserDocument({
    ...currentUser,
    email: seedUser.email,
    displayName: seedUser.displayName,
    avatarUrl: seedUser.avatarUrl,
    updatedAt: now,
  });
}

function buildCurrentUserRulesError(
  sessionUser: AuthSessionUser,
  error: unknown,
  operation: string,
) {
  return createRepositoryError(USER_ACCOUNT_PERMISSION_MESSAGE, 'permission-denied', {
    cause: error,
    context: mergeErrorContext(
      error instanceof Error ? (error as ErrorWithCode).context : undefined,
      {
        collection: FIRESTORE_COLLECTIONS.users,
        operation,
        userId: sessionUser.authId,
      },
    ),
    partialSnapshot:
      error instanceof Error ? (error as ErrorWithCode).partialSnapshot : undefined,
  });
}

async function loadCurrentUserDocumentForBootstrap(
  sessionUserOverride?: AuthSessionUser | null,
) {
  const sessionUser =
    sessionUserOverride ??
    authService.getCurrentUser() ??
    (await authService.restoreSession());

  if (!sessionUser) {
    return null;
  }

  const firestore = requireFirestore();
  const userRef = doc(firestore, FIRESTORE_COLLECTIONS.users, sessionUser.authId);
  const now = nowIso();
  const seedUser = buildCurrentUserSeedDocument(sessionUser, now);
  let existing: DocumentSnapshot<DocumentData>;

  try {
    existing = await runLoggedBootstrapQuery(
      {
        collection: FIRESTORE_COLLECTIONS.users,
        operation: 'get-current-user',
        userId: sessionUser.authId,
      },
      async () => await getDoc(userRef),
    );
  } catch (error) {
    if (extractErrorCode(error) !== 'permission-denied') {
      throw error;
    }

    logAuthLink('permission-denied', {
      stage: 'get-current-user',
      userId: sessionUser.authId,
      code: extractErrorCode(error),
      message: error instanceof Error ? error.message : 'Erro desconhecido.',
      context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
    });

    throw buildCurrentUserRulesError(sessionUser, error, 'get-current-user');
  }

  if (!existing.exists()) {
    logAuthLink('user-doc', {
      userId: sessionUser.authId,
      exists: false,
      created: false,
      source: 'session-seed-no-write',
      activeTeamId: seedUser.activeTeamId,
    });
    return seedUser;
  }

  const rawUser = existing.data() as LegacyCompatibleUserDocument | undefined;
  const currentUser = normalizeUserDocument(
    parseDoc<LegacyCompatibleUserDocument>(existing),
  );
  const needsMigration =
    rawUser?.appRole == null ||
    rawUser?.canCreateTeam == null ||
    rawUser?.activeTeamId === undefined ||
    rawUser?.teamId === undefined ||
    rawUser?.playerId === undefined ||
    rawUser?.avatarUrl === undefined ||
    rawUser?.notificationTokens === undefined;

  if (
    currentUser.email !== seedUser.email ||
    currentUser.displayName !== seedUser.displayName ||
    currentUser.avatarUrl !== seedUser.avatarUrl ||
    needsMigration
  ) {
    logAuthLink('user-doc', {
      userId: sessionUser.authId,
      exists: true,
      migrated: false,
      pendingSync: true,
      activeTeamId: currentUser.activeTeamId ?? null,
    });
    return buildCurrentUserDocumentWithSessionProfile(currentUser, sessionUser, now);
  }

  logAuthLink('user-doc', {
    userId: sessionUser.authId,
    exists: true,
    migrated: false,
    activeTeamId: currentUser.activeTeamId ?? null,
  });
  return currentUser;
}

async function ensureCurrentUserDocumentAfterLogin(
  sessionUserOverride?: AuthSessionUser | null,
) {
  const sessionUser =
    sessionUserOverride ??
    authService.getCurrentUser() ??
    (await authService.restoreSession());

  if (!sessionUser) {
    return null;
  }

  const firestore = requireFirestore();
  const userRef = doc(firestore, FIRESTORE_COLLECTIONS.users, sessionUser.authId);
  const now = nowIso();
  const seedUser = buildCurrentUserSeedDocument(sessionUser, now);
  let existing: DocumentSnapshot<DocumentData>;

  try {
    existing = await runLoggedBootstrapQuery(
      {
        collection: FIRESTORE_COLLECTIONS.users,
        operation: 'ensure-current-user-after-login',
        userId: sessionUser.authId,
      },
      async () => await getDoc(userRef),
    );
  } catch (error) {
    if (extractErrorCode(error) === 'permission-denied') {
      logAuthLink('permission-denied', {
        stage: 'ensure-current-user-after-login',
        userId: sessionUser.authId,
        code: extractErrorCode(error),
        message: error instanceof Error ? error.message : 'Erro desconhecido.',
        context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
      });
      throw buildCurrentUserRulesError(sessionUser, error, 'ensure-current-user-after-login');
    }

    throw error;
  }

  if (!existing.exists()) {
    try {
      await setDoc(userRef, seedUser);
    } catch (error) {
      if (extractErrorCode(error) === 'permission-denied') {
        logAuthLink('permission-denied', {
          stage: 'create-current-user-after-login',
          userId: sessionUser.authId,
          code: extractErrorCode(error),
          message: error instanceof Error ? error.message : 'Erro desconhecido.',
          context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
        });
        throw buildCurrentUserRulesError(sessionUser, error, 'create-current-user-after-login');
      }

      throw error;
    }

    logAuthLink('user-doc', {
      userId: sessionUser.authId,
      exists: false,
      created: true,
      activeTeamId: seedUser.activeTeamId,
    });
    return seedUser;
  }

  const rawUser = existing.data() as LegacyCompatibleUserDocument | undefined;
  const currentUser = normalizeUserDocument(
    parseDoc<LegacyCompatibleUserDocument>(existing),
  );
  const nextUser = buildCurrentUserDocumentWithSessionProfile(currentUser, sessionUser, now);
  const needsMigration =
    rawUser?.appRole == null ||
    rawUser?.canCreateTeam == null ||
    rawUser?.activeTeamId === undefined ||
    rawUser?.teamId === undefined ||
    rawUser?.playerId === undefined ||
    rawUser?.avatarUrl === undefined ||
    rawUser?.notificationTokens === undefined;
  const shouldPersist =
    currentUser.email !== nextUser.email ||
    currentUser.displayName !== nextUser.displayName ||
    currentUser.avatarUrl !== nextUser.avatarUrl ||
    currentUser.appRole !== nextUser.appRole ||
    currentUser.canCreateTeam !== nextUser.canCreateTeam ||
    currentUser.activeTeamId !== nextUser.activeTeamId ||
    currentUser.teamId !== nextUser.teamId ||
    currentUser.playerId !== nextUser.playerId ||
    JSON.stringify(currentUser.notificationTokens ?? []) !==
      JSON.stringify(nextUser.notificationTokens ?? []) ||
    needsMigration;

  if (shouldPersist) {
    try {
      await setDoc(userRef, nextUser);
    } catch (error) {
      if (extractErrorCode(error) === 'permission-denied') {
        logAuthLink('permission-denied', {
          stage: 'update-current-user-after-login',
          userId: sessionUser.authId,
          code: extractErrorCode(error),
          message: error instanceof Error ? error.message : 'Erro desconhecido.',
          context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
        });
        throw buildCurrentUserRulesError(sessionUser, error, 'update-current-user-after-login');
      }

      throw error;
    }

    logAuthLink('user-doc', {
      userId: sessionUser.authId,
      exists: true,
      migrated: true,
      activeTeamId: nextUser.activeTeamId ?? null,
    });
    return nextUser;
  }

  logAuthLink('user-doc', {
    userId: sessionUser.authId,
    exists: true,
    migrated: false,
    activeTeamId: currentUser.activeTeamId ?? null,
  });
  return currentUser;
}

function buildTeamMemberDocument(input: {
  id: string;
  userId: string;
  teamId: string;
  playerId: string | null;
  inviteCodeUsed?: string | null;
  roles: TeamMember['roles'];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  createdAt: string;
  updatedAt: string;
  joinedAt?: string;
  status?: TeamMember['status'];
}) {
  return normalizeTeamMemberDocument({
    id: input.id,
    userId: input.userId,
    teamId: input.teamId,
    playerId: input.playerId,
    inviteCodeUsed: input.inviteCodeUsed ?? null,
    roles: input.roles,
    canManageTeam: input.canManageTeam,
    canManagePlayers: input.canManagePlayers,
    joinedAt: input.joinedAt ?? input.createdAt,
    status: input.status ?? 'active',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

function membershipPriority(membership: TeamMember) {
  return (
    membership.roles.length * 1000 +
    (membership.canManageTeam ? 100 : 0) +
    (membership.canManagePlayers ? 50 : 0) +
    (membership.playerId ? 25 : 0) +
    new Date(membership.updatedAt).getTime() / 1_000_000_000_000
  );
}

function sortMembershipsByPriority(memberships: TeamMember[]) {
  return [...memberships].sort(
    (left, right) => membershipPriority(right) - membershipPriority(left),
  );
}

async function reconcileDuplicateMemberships(
  userId: string,
  memberships: TeamMember[],
) {
  const firestore = requireFirestore();
  const activeMemberships = memberships.filter((membership) => membership.status === 'active');
  const grouped = activeMemberships.reduce<Map<string, TeamMember[]>>((acc, membership) => {
    const current = acc.get(membership.teamId) ?? [];
    acc.set(membership.teamId, [...current, membership]);
    return acc;
  }, new Map());

  const duplicates = [...grouped.entries()].filter(([, items]) => items.length > 1);

  if (duplicates.length === 0) {
    return memberships;
  }

  const updatedAt = nowIso();
  const batch = writeBatch(firestore);
  const normalizedById = new Map(memberships.map((membership) => [membership.id, membership]));

  for (const [, items] of duplicates) {
    const sortedItems = sortMembershipsByPriority(items);
    const winner = sortedItems[0];
    const mergedRoles = [...new Set(sortedItems.flatMap((membership) => membership.roles))];
    const playerId =
      sortedItems.find((membership) => membership.playerId)?.playerId ??
      winner.playerId ??
      null;
    const mergedMembership = buildTeamMemberDocument({
      ...winner,
      playerId,
      roles: mergedRoles,
      canManageTeam: sortedItems.some((membership) => membership.canManageTeam),
      canManagePlayers: sortedItems.some((membership) => membership.canManagePlayers),
      status: 'active',
      updatedAt,
    });

    batch.set(
      doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, mergedMembership.id),
      mergedMembership,
    );
    applyFirestoreBatchMutation(batch, buildTeamMembershipIndexMutation(mergedMembership));
    normalizedById.set(mergedMembership.id, mergedMembership);

    for (const duplicate of sortedItems.slice(1)) {
      const inactiveMembership = buildTeamMemberDocument({
        ...duplicate,
        playerId: null,
        status: 'inactive',
        updatedAt,
      });

      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, inactiveMembership.id),
        inactiveMembership,
      );
      applyFirestoreBatchMutation(batch, buildTeamMembershipIndexMutation(inactiveMembership));
      normalizedById.set(inactiveMembership.id, inactiveMembership);
    }
  }

  await batch.commit();

  return [...normalizedById.values()].filter((membership) => membership.userId === userId);
}

function buildUserContextDocument(
  user: User,
  activeMembership: TeamMember | null,
  teamsById: Map<string, Team>,
) {
  const activeTeam =
    activeMembership ? teamsById.get(activeMembership.teamId) ?? null : null;

  return normalizeUserDocument({
    ...user,
    activeTeamId: activeMembership?.teamId ?? null,
    teamId: activeMembership?.teamId ?? null,
    playerId: activeMembership?.playerId ?? null,
    appRole:
      user.appRole === 'owner'
        ? 'owner'
        : activeMembership?.roles.includes('admin') || activeTeam?.adminUserId === user.id
          ? 'team_admin'
          : 'player',
    updatedAt: nowIso(),
  });
}

async function persistUserContext(
  user: User,
  activeMembership: TeamMember | null,
  teamsById: Map<string, Team>,
) {
  const firestore = requireFirestore();
  const updatedUser = buildUserContextDocument(user, activeMembership, teamsById);

  await setDoc(doc(firestore, FIRESTORE_COLLECTIONS.users, user.id), updatedUser);
  return updatedUser;
}

async function repairActiveTeam(user: User) {
  const memberships = sortMembershipsByPriority(await fetchTeamMembersByUserId(user.id)).filter(
    (membership) => membership.status === 'active',
  );
  const { teams } = await fetchAccessibleTeamsResultByIds(
    memberships.map((membership) => membership.teamId),
    user.id,
  );
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const nextActiveMembership =
    memberships.find(
      (membership) =>
        membership.teamId === user.activeTeamId && teamsById.has(membership.teamId),
    ) ??
    memberships.find((membership) => teamsById.has(membership.teamId)) ??
    null;

  logAuthLink('repair-active-team', {
    userId: user.id,
    previousActiveTeamId: user.activeTeamId ?? null,
    nextActiveTeamId: nextActiveMembership?.teamId ?? null,
    reason: nextActiveMembership ? 'login-sync' : 'no-active-membership',
  });

  return await persistUserContext(user, nextActiveMembership, teamsById);
}

async function repairUserContext(user: User) {
  await repairCurrentUserMembershipsByLinkedPlayers(user);
  return await repairActiveTeam(user);
}

async function repairCurrentUserMembershipsByLinkedPlayers(user: User) {
  const normalizedUserEmail = normalizeEmail(user.email);
  const [linkedByUserId, linkedByEmail] = await Promise.all([
    fetchPlayersByLinkedUserId(user.id),
    fetchPlayersByLinkedEmail(normalizedUserEmail),
  ]);
  const playersById = new Map<string, Player>();

  for (const player of [...linkedByUserId, ...linkedByEmail]) {
    if (isPlayerAvailableForLinking(player)) {
      playersById.set(player.id, player);
    }
  }

  if (playersById.size === 0) {
    return;
  }

  const playersByTeam = [...playersById.values()].reduce<Map<string, Player[]>>(
    (acc, player) => {
      const current = acc.get(player.teamId) ?? [];
      acc.set(player.teamId, [...current, player]);
      return acc;
    },
    new Map(),
  );
  const updatedAt = nowIso();

  for (const [teamId, candidates] of playersByTeam.entries()) {
    const player = resolvePlayerForUser({
      teamPlayers: candidates,
      teamId,
      user,
    });

    if (!player) {
      continue;
    }

    let normalizedPlayer = player;
    if (
      player.linkedUserId !== user.id ||
      normalizeEmail(player.linkedEmail) !== normalizedUserEmail
    ) {
      normalizedPlayer = normalizePlayerDocument({
        ...player,
        linkedUserId: user.id,
        linkedEmail: normalizedUserEmail,
        updatedAt,
      });
      await setDoc(
        doc(requireFirestore(), FIRESTORE_COLLECTIONS.players, normalizedPlayer.id),
        normalizedPlayer,
      );
    }

    const team = await fetchTeamById(teamId);
    const roles: TeamMember['roles'] =
      team.adminUserId === user.id ? ['admin', 'player'] : ['player'];

    await upsertTeamMemberDocument({
      userId: user.id,
      teamId,
      playerId: normalizedPlayer.id,
      roles,
      canManageTeam: roles.includes('admin'),
      canManagePlayers: roles.includes('admin'),
      createdAt: normalizedPlayer.createdAt,
      updatedAt,
      joinedAt: user.createdAt,
      status: 'active',
    });
    await ensureOpenMatchAttendanceForPlayer(normalizedPlayer, updatedAt);
  }
}

function buildUserWithoutActiveTeamContext(user: User) {
  return normalizeUserDocument({
    ...user,
    activeTeamId: null,
    teamId: null,
    playerId: null,
  });
}

async function fetchBootstrapMembershipsByUserId(userId: string) {
  try {
    return {
      memberships: sortMembershipsByPriority(await fetchTeamMembersByUserId(userId)),
      blockedByPermissionDenied: false,
    };
  } catch (error) {
    if (extractErrorCode(error) !== 'permission-denied') {
      throw error;
    }

    if (__DEV__) {
      console.warn(
        '[bootstrap-firestore] memberships query blocked, using empty list',
        JSON.stringify(
          {
            userId,
            code: extractErrorCode(error),
            message: error instanceof Error ? error.message : 'Erro desconhecido.',
            context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
          },
          null,
          2,
        ),
      );
    }

    return {
      memberships: [] as TeamMember[],
      blockedByPermissionDenied: true,
    };
  }
}

function buildSafeSnapshotState(
  user: User,
  options?: {
    memberships?: TeamMember[];
    teams?: Team[];
    accessNotice?: string | null;
  },
) {
  const safeUser = buildUserWithoutActiveTeamContext(user);

  return {
    ...emptySnapshot,
    users: [safeUser],
    teams: options?.teams ?? [],
    teamMembers: options?.memberships ?? [],
    accessNotice: options?.accessNotice ?? null,
  } satisfies AppSnapshot;
}

async function buildSafeSnapshotWithoutActiveTeam(
  user: User,
  options?: {
    memberships?: TeamMember[];
    teams?: Team[];
    accessNotice?: string | null;
    skipMembershipFetch?: boolean;
  },
): Promise<AppSnapshot> {
  logBootstrapFirestore('no-active-team');

  const bootstrapMembershipResult = options?.memberships
    ? {
        memberships: options.memberships,
        blockedByPermissionDenied: false,
      }
    : options?.skipMembershipFetch
      ? {
          memberships: [] as TeamMember[],
          blockedByPermissionDenied: false,
        }
      : await fetchBootstrapMembershipsByUserId(user.id);
  const memberships = bootstrapMembershipResult.memberships;
  const accessNotice =
    options?.accessNotice ??
    (bootstrapMembershipResult.blockedByPermissionDenied
      ? TEAM_ACCESS_PERMISSION_MESSAGE
      : user.teamId != null || user.playerId != null
        ? LOST_TEAM_ACCESS_MESSAGE
        : null);

  logBootstrapFirestore('safe-empty-snapshot', {
    userId: user.id,
    membershipsCount: memberships.length,
    teamsCount: options?.teams?.length ?? 0,
  });

  return buildSafeSnapshotState(user, {
    memberships,
    teams: options?.teams ?? [],
    accessNotice,
  });
}

type EnsureMembershipsForUserOptions = {
  allowActiveTeamFallback?: boolean;
  allowLocalContextFallbackOnWriteFailure?: boolean;
  allowMembershipNormalizationWrites?: boolean;
  allowRepairMembershipsFromLinkedPlayers?: boolean;
  allowRepairMembershipPlayerLink?: boolean;
  allowPersistUserContext?: boolean;
};

async function ensureMembershipsForUser(
  user: User,
  options?: EnsureMembershipsForUserOptions,
) {
  const allowMembershipNormalizationWrites =
    options?.allowMembershipNormalizationWrites !== false;
  const allowRepairMembershipsFromLinkedPlayers =
    options?.allowRepairMembershipsFromLinkedPlayers !== false;
  const allowRepairMembershipPlayerLink =
    options?.allowRepairMembershipPlayerLink !== false;
  const allowPersistUserContext = options?.allowPersistUserContext !== false;
  let accessNotice: string | null = null;
  let fetchedMemberships: TeamMember[];

  try {
    fetchedMemberships = await fetchTeamMembersByUserId(user.id);
  } catch (error) {
    if (extractErrorCode(error) === 'permission-denied') {
      logAuthLink('permission-denied', {
        stage: 'fetch-memberships',
        userId: user.id,
        code: extractErrorCode(error),
        message: error instanceof Error ? error.message : 'Erro desconhecido.',
        context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
      });
    }

    throw error;
  }

  let memberships = allowMembershipNormalizationWrites
    ? await reconcileDuplicateMemberships(user.id, fetchedMemberships)
    : fetchedMemberships;
  const legacyTeamId = user.activeTeamId ?? user.teamId ?? null;

  logAuthLink('memberships', {
    userId: user.id,
    activeTeamId: user.activeTeamId ?? null,
    count: memberships.length,
    activeCount: memberships.filter((membership) => membership.status === 'active').length,
    teamIds: [...new Set(memberships.map((membership) => membership.teamId))],
  });

  if (memberships.length === 0 && allowRepairMembershipsFromLinkedPlayers) {
    try {
      await repairCurrentUserMembershipsByLinkedPlayers(user);
      memberships = await reconcileDuplicateMemberships(
        user.id,
        await fetchTeamMembersByUserId(user.id),
      );
      logAuthLink('memberships', {
        userId: user.id,
        activeTeamId: user.activeTeamId ?? null,
        count: memberships.length,
        activeCount: memberships.filter((membership) => membership.status === 'active').length,
        teamIds: [...new Set(memberships.map((membership) => membership.teamId))],
        repairedFromLinkedPlayers: true,
      });
    } catch (error) {
      if (extractErrorCode(error) !== 'permission-denied') {
        throw error;
      }

      accessNotice = LOST_TEAM_ACCESS_MESSAGE;
      if (__DEV__) {
        console.warn(
          '[bootstrap-firestore] skipped linked-player membership repair',
          JSON.stringify(
            {
              userId: user.id,
              code: extractErrorCode(error),
              message: error instanceof Error ? error.message : 'Erro desconhecido.',
              context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
            },
            null,
            2,
          ),
        );
      }
    }
  }

  if (legacyTeamId && !memberships.some((membership) => membership.teamId === legacyTeamId)) {
    accessNotice = LOST_TEAM_ACCESS_MESSAGE;
  }

  let teams: Team[];
  let blockedTeamIds: string[] = [];

  try {
    const teamsResult = await fetchAccessibleTeamsResultByIds(
      memberships.map((membership) => membership.teamId),
      user.id,
    );
    teams = teamsResult.teams;
    blockedTeamIds = teamsResult.blockedTeamIds;
  } catch (error) {
    if (
      extractErrorCode(error) !== 'permission-denied' ||
      options?.allowLocalContextFallbackOnWriteFailure !== true
    ) {
      throw error;
    }

    accessNotice = accessNotice ?? LOST_TEAM_ACCESS_MESSAGE;

    if (__DEV__) {
      console.warn(
        '[bootstrap-firestore] skipped team hydration after memberships load',
        JSON.stringify(
          {
            userId: user.id,
            code: extractErrorCode(error),
            message: error instanceof Error ? error.message : 'Erro desconhecido.',
            context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
          },
          null,
          2,
        ),
      );
    }

    return {
      user: buildUserWithoutActiveTeamContext(user),
      memberships,
      teams: [],
      accessNotice,
    };
  }

  if (teams.length === 0 && blockedTeamIds.length > 0) {
    accessNotice = TEAM_ACCESS_PERMISSION_MESSAGE;
  }

  const accessibleTeamIds = new Set(teams.map((team) => team.id));
  const accessibleMemberships = sortMembershipsByPriority(
    memberships.filter(
      (membership) =>
        membership.status === 'active' && accessibleTeamIds.has(membership.teamId),
    ),
  );

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const matchedActiveMembership =
    accessibleMemberships.find((membership) => membership.teamId === user.activeTeamId) ?? null;
  const fallbackActiveMembership =
    options?.allowActiveTeamFallback === false
      ? null
      : accessibleMemberships[0] ?? null;
  let activeMembership = matchedActiveMembership ?? fallbackActiveMembership;
  let currentUser = user;
  const activeTeamRepairReason = !matchedActiveMembership && activeMembership
    ? hasAssignedId(user.activeTeamId)
      ? 'invalid-or-inaccessible-active-team'
      : 'missing-active-team'
    : null;

  logAuthLink('active-team', {
    userId: user.id,
    storedActiveTeamId: user.activeTeamId ?? null,
    resolvedActiveTeamId: activeMembership?.teamId ?? null,
    accessibleTeamIds: teams.map((team) => team.id),
  });

  if (activeTeamRepairReason) {
    logAuthLink('repair-active-team', {
      userId: user.id,
      reason: activeTeamRepairReason,
      previousActiveTeamId: user.activeTeamId ?? null,
      nextActiveTeamId: activeMembership?.teamId ?? null,
    });
  }

  if (allowRepairMembershipPlayerLink && activeMembership?.roles.includes('player')) {
    const activeTeam = teamsById.get(activeMembership.teamId) ?? null;

    if (activeTeam) {
      const repaired = await ensureMembershipPlayerLink({
        user: currentUser,
        membership: activeMembership,
        team: activeTeam,
      });
      currentUser = repaired.user;
      activeMembership = repaired.membership;
      memberships = memberships.map((membership) =>
        membership.id === repaired.membership.id ? repaired.membership : membership,
      );
    }
  }

  const contextOutOfSync =
    currentUser.activeTeamId !== (activeMembership?.teamId ?? null) ||
    currentUser.teamId !== (activeMembership?.teamId ?? null) ||
    currentUser.playerId !== (activeMembership?.playerId ?? null);
  let syncedUser = currentUser;

  if (contextOutOfSync) {
    if (!allowPersistUserContext) {
      syncedUser = buildUserContextDocument(currentUser, activeMembership, teamsById);
    } else {
      try {
        syncedUser = await persistUserContext(currentUser, activeMembership, teamsById);
      } catch (error) {
        if (
          extractErrorCode(error) !== 'permission-denied' ||
          options?.allowLocalContextFallbackOnWriteFailure !== true
        ) {
          throw error;
        }

        accessNotice = accessNotice ?? LOST_TEAM_ACCESS_MESSAGE;
        syncedUser = buildUserContextDocument(currentUser, activeMembership, teamsById);

        if (__DEV__) {
          console.warn(
            '[bootstrap-firestore] local-only user context fallback',
            JSON.stringify(
              {
                userId: user.id,
                activeTeamId: currentUser.activeTeamId ?? null,
                nextActiveTeamId: activeMembership?.teamId ?? null,
                code: extractErrorCode(error),
                message: error instanceof Error ? error.message : 'Erro desconhecido.',
                context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
              },
              null,
              2,
            ),
          );
        }
      }
    }
  }

  return {
    user: syncedUser,
    memberships,
    teams,
    accessNotice,
  };
}

async function buildSnapshotForResolvedUser(currentUser: User): Promise<AppSnapshot> {
  logAuthLink('active-team', {
    userId: currentUser.id,
    storedActiveTeamId: currentUser.activeTeamId ?? null,
    phase: 'before-membership-resolution',
  });

  let resolvedMemberships: Awaited<ReturnType<typeof ensureMembershipsForUser>>;

  try {
    resolvedMemberships = await ensureMembershipsForUser(currentUser, {
      allowActiveTeamFallback: true,
      allowMembershipNormalizationWrites: false,
      allowRepairMembershipsFromLinkedPlayers: false,
      allowRepairMembershipPlayerLink: false,
      allowPersistUserContext: false,
    });
  } catch (error) {
    if (extractErrorCode(error) !== 'permission-denied') {
      throw error;
    }

    return await buildSafeSnapshotWithoutActiveTeam(currentUser, {
      accessNotice: TEAM_ACCESS_PERMISSION_MESSAGE,
    });
  }

  const { user, memberships, teams } = resolvedMemberships;
  const accessNotice = resolvedMemberships.accessNotice ?? null;
  const recoveryAccessNotice =
    accessNotice ??
    (memberships.length > 0 ||
    hasAssignedId(currentUser.activeTeamId) ||
    hasAssignedId(currentUser.teamId) ||
    hasAssignedId(currentUser.playerId)
      ? LOST_TEAM_ACCESS_MESSAGE
      : null);
  const activeMembership =
    memberships.find(
      (membership) =>
        membership.teamId === user.activeTeamId && membership.status === 'active',
    ) ?? null;
  const activeTeamId = activeMembership?.teamId ?? null;
  const trace = getCurrentBootstrapTrace();

  if (trace) {
    trace.activeTeamId = activeTeamId;
  }

  logBootstrapFirestore('currentUser', user.id);
  logBootstrapFirestore('activeTeamId', activeTeamId);

  if (!activeTeamId) {
    logBootstrapFirestore('no-active-team');
    logBootstrapFirestore('safe-empty-snapshot', {
      userId: user.id,
      membershipsCount: memberships.length,
      teamsCount: teams.length,
    });

    return buildSafeSnapshotState(user, {
      memberships,
      teams,
      accessNotice: recoveryAccessNotice,
    });
  }

  try {
    const [
      ratingCriteria,
      players,
      matches,
      lineups,
      attendance,
      matchStats,
      matchDiaryEntries,
      mvpVotes,
      playerRatings,
      notifications,
      seasons,
    ] = await Promise.all([
      loadTeamRatingCriteria(activeTeamId),
      fetchPlayersByTeamId(activeTeamId),
      fetchMatchesByTeamId(activeTeamId),
      fetchLineupsByTeamId(activeTeamId),
      fetchAttendanceByTeamId(activeTeamId),
      fetchMatchStatsByTeamId(activeTeamId),
      fetchMatchDiaryEntriesByTeamId(activeTeamId),
      fetchMvpVotesByTeamId(activeTeamId),
      fetchPlayerRatingsByTeamId(activeTeamId),
      fetchAccessibleNotificationsByTeamId(activeTeamId, user.id),
      fetchSeasonsByTeamId(activeTeamId),
    ]);

    return {
      ...emptySnapshot,
      users: [user],
      teams,
      teamMembers: memberships,
      ratingCriteria,
      players,
      matches,
      lineups,
      attendance,
      matchStats,
      matchDiaryEntries,
      mvpVotes,
      playerRatings,
      notifications,
      seasons,
      accessNotice: resolvedMemberships.accessNotice,
    };
  } catch (error) {
    if (extractErrorCode(error) !== 'permission-denied') {
      throw error;
    }

    throw createRepositoryError(
      'Não foi possível carregar o contexto privado do time.',
      'permission-denied',
      {
        cause: error,
        context: mergeErrorContext(
          error instanceof Error ? (error as ErrorWithCode).context : undefined,
          {
            operation: 'bootstrap-private-team-load',
            teamId: activeTeamId,
            userId: user.id,
          },
        ),
        partialSnapshot: buildSafeSnapshotState(user, {
          memberships,
          teams,
          accessNotice: recoveryAccessNotice,
        }),
      },
    );
  }
}

async function buildSnapshotForCurrentUser(): Promise<AppSnapshot> {
  const sessionUser =
    authService.getCurrentUser() ?? (await authService.restoreSession());

  return await withBootstrapTrace(
    {
      userId: sessionUser?.authId ?? null,
      activeTeamId: null,
    },
    async () => {
      const currentUser = await loadCurrentUserDocumentForBootstrap(sessionUser);

      if (!currentUser) {
        return emptySnapshot;
      }
      return await buildSnapshotForResolvedUser(currentUser);
    },
  );
}

async function buildSnapshotForUserId(userId: string): Promise<AppSnapshot> {
  const sessionUser = authService.getCurrentUser();

  return await withBootstrapTrace(
    {
      userId,
      activeTeamId: null,
    },
    async () => {
      const currentUser =
        sessionUser?.authId === userId
          ? await loadCurrentUserDocumentForBootstrap(sessionUser)
          : await fetchUserById(userId);

      if (!currentUser) {
        return emptySnapshot;
      }
      return await buildSnapshotForResolvedUser(currentUser);
    },
  );
}

function resolveActiveMembership(
  user: User | null,
  memberships: TeamMember[],
  options?: { allowFallback?: boolean },
) {
  const matchedMembership =
    memberships.find(
      (membership) =>
        membership.status === 'active' && membership.teamId === user?.activeTeamId,
    ) ?? null;

  if (matchedMembership) {
    return matchedMembership;
  }

  if (options?.allowFallback === false) {
    return null;
  }

  return memberships.find((membership) => membership.status === 'active') ?? null;
}

function createRealtimeStateFromSnapshot(snapshot: AppSnapshot): RealtimeSnapshotState {
  return {
    user: snapshot.users[0] ?? null,
    memberships: snapshot.teamMembers,
    teamsById: new Map(snapshot.teams.map((team) => [team.id, team])),
    ratingCriteria: snapshot.ratingCriteria,
    players: snapshot.players,
    matches: snapshot.matches,
    lineups: snapshot.lineups,
    attendance: snapshot.attendance,
    matchStats: snapshot.matchStats,
    matchDiaryEntries: snapshot.matchDiaryEntries,
    mvpVotes: snapshot.mvpVotes,
    playerRatings: snapshot.playerRatings,
    notifications: snapshot.notifications,
    seasons: snapshot.seasons,
    accessNotice: snapshot.accessNotice ?? null,
  };
}

function buildSnapshotFromRealtimeState(state: RealtimeSnapshotState): AppSnapshot {
  const activeMembership = resolveActiveMembership(state.user, state.memberships);
  const user = state.user
    ? {
        ...state.user,
        activeTeamId: activeMembership?.teamId ?? null,
        teamId: activeMembership?.teamId ?? null,
        playerId: activeMembership?.playerId ?? null,
      }
    : null;
  const orderedTeams = [...state.teamsById.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  return {
    ...emptySnapshot,
    users: user ? [user] : [],
    teams: orderedTeams,
    teamMembers: state.memberships,
    ratingCriteria: state.ratingCriteria,
    players: state.players,
    matches: state.matches,
    lineups: state.lineups,
    attendance: state.attendance,
    matchStats: state.matchStats,
    matchDiaryEntries: state.matchDiaryEntries,
    mvpVotes: state.mvpVotes,
    playerRatings: state.playerRatings,
    notifications: state.notifications,
    seasons: state.seasons,
    accessNotice: state.accessNotice,
  };
}

async function createUniqueInviteCode(excludedTeamId?: string) {
  let inviteCode = createInviteCode();

  while (true) {
    const invite = await fetchTeamInviteByCode(inviteCode);
    if (!invite || invite.teamId === excludedTeamId) {
      return inviteCode;
    }

    inviteCode = createInviteCode();
  }
}

async function validateLinkedUserAssignment(
  linkedUserId: string,
  teamId: string,
  currentPlayerId?: string,
) {
  const linkedUser = await fetchUserById(linkedUserId);
  const duplicatePlayer = (await fetchPlayersByTeamId(teamId)).find(
    (player) =>
      player.linkedUserId === linkedUser.id && player.id !== currentPlayerId,
  );

  if (duplicatePlayer) {
    throw createRepositoryError(
      'Esse usuario ja esta vinculado a outro jogador.',
      'failed-precondition',
    );
  }

  return linkedUser;
}

function validateLinkedEmailAssignment(
  teamPlayers: Player[],
  linkedEmail?: string | null,
  currentPlayerId?: string,
) {
  if (!linkedEmail?.trim()) {
    return null;
  }

  const normalizedLinkedEmail = normalizeEmail(linkedEmail);
  const duplicate = teamPlayers.find(
    (player) =>
      normalizeEmail(player.linkedEmail ?? '') === normalizedLinkedEmail &&
      player.id !== currentPlayerId,
  );

  if (duplicate) {
    throw createRepositoryError(
      'Esse e-mail ja esta reservado para outro jogador do time.',
      'failed-precondition',
    );
  }

  return normalizedLinkedEmail;
}

async function assertJerseyAvailable(
  teamId: string,
  jerseyNumber: number,
  excludedPlayerId?: string,
) {
  const teamPlayers = await fetchPlayersByTeamId(teamId);
  const duplicate = teamPlayers.find(
    (player) =>
      player.jerseyNumber === jerseyNumber && player.id !== excludedPlayerId,
  );

  if (duplicate) {
    throw createRepositoryError(
      `A camisa ${jerseyNumber} ja esta em uso no time.`,
      'failed-precondition',
    );
  }
}

async function ensurePlayerBelongsToTeam(playerId: string, teamId: string) {
  return fetchPlayerByIdForTeam(teamId, playerId);
}

async function sanitizeMentionedPlayerIds(teamId: string, mentionedPlayerIds: string[] = []) {
  const uniquePlayerIds = [...new Set(mentionedPlayerIds.filter(Boolean))];

  for (const playerId of uniquePlayerIds) {
    await ensurePlayerBelongsToTeam(playerId, teamId);
  }

  return uniquePlayerIds;
}

function validateLineupSlots(input: SaveLineupInput) {
  const starterIds = input.starters.map((starter) => starter.playerId);
  const duplicateStarters = starterIds.filter(
    (playerId, index) => starterIds.indexOf(playerId) !== index,
  );
  const duplicateBench = input.benchPlayerIds.filter(
    (playerId, index) => input.benchPlayerIds.indexOf(playerId) !== index,
  );
  const repeatedBetweenGroups = starterIds.filter((playerId) =>
    input.benchPlayerIds.includes(playerId),
  );

  if (
    duplicateStarters.length > 0 ||
    duplicateBench.length > 0 ||
    repeatedBetweenGroups.length > 0
  ) {
    throw createRepositoryError(
      'A escalação tem jogadores repetidos. Revise titulares e reservas.',
      'failed-precondition',
    );
  }
}

async function nextJerseyNumber(teamId: string) {
  const teamPlayers = await fetchPlayersByTeamId(teamId);
  return (
    teamPlayers.reduce(
      (highestNumber, player) => Math.max(highestNumber, player.jerseyNumber),
      0,
    ) + 1
  );
}

function isMatchOpenForAttendance(match: Match) {
  return match.status !== 'finished' && match.status !== 'canceled';
}

async function ensureOpenMatchAttendanceForPlayer(player: Player, updatedAt = nowIso()) {
  if (!isActivePlayer(player)) {
    return;
  }

  const firestore = requireFirestore();
  const [matches, attendance] = await Promise.all([
    fetchMatchesByTeamId(player.teamId),
    fetchAttendanceByTeamId(player.teamId),
  ]);
  const openMatches = matches.filter(isMatchOpenForAttendance);

  if (openMatches.length === 0) {
    return;
  }

  const attendanceByKey = new Map(
    attendance.map((item) => [buildStableDocumentId(item.matchId, item.playerId), item]),
  );
  const desiredUserId = player.linkedUserId ?? null;
  const batch = writeBatch(firestore);
  let hasChanges = false;

  for (const match of openMatches) {
    const attendanceKey = buildStableDocumentId(match.id, player.id);
    const existingRecord = attendanceByKey.get(attendanceKey) ?? null;

    if (existingRecord) {
      if (existingRecord.userId !== desiredUserId) {
        batch.set(
          doc(firestore, FIRESTORE_COLLECTIONS.attendance, existingRecord.id),
          normalizeAttendanceDocument({
            ...existingRecord,
            userId: desiredUserId,
            updatedAt,
          }),
        );
        hasChanges = true;
      }

      continue;
    }

    const attendanceRecord = normalizeAttendanceDocument({
      id: attendanceKey,
      teamId: player.teamId,
      matchId: match.id,
      playerId: player.id,
      userId: desiredUserId,
      status: 'pending',
      respondedAt: null,
      createdAt: updatedAt,
      updatedAt,
    });
    batch.set(
      doc(firestore, FIRESTORE_COLLECTIONS.attendance, attendanceRecord.id),
      attendanceRecord,
    );
    hasChanges = true;
  }

  if (hasChanges) {
    await batch.commit();
  }
}

interface ResolvedFinishedMatchPlayerInput extends RegisterFinishedMatchPlayerInput {
  player: Player;
  started: boolean;
}

function resolveFinishedMatchPlayersInput(input: {
  players: RegisterFinishedMatchPlayerInput[];
  teamPlayers: Player[];
  teamScore: number;
}) {
  if (input.players.length === 0) {
    throw createRepositoryError(
      'Informe pelo menos um jogador para registrar a partida.',
      'failed-precondition',
    );
  }

  const playersById = new Map(input.teamPlayers.map((player) => [player.id, player]));
  const usedPlayerIds = new Set<string>();
  const resolvedPlayers = input.players.map<ResolvedFinishedMatchPlayerInput>((item) => {
    const player = playersById.get(item.playerId);
    if (!player) {
      throw createRepositoryError(
        'Todos os jogadores precisam pertencer ao time atual.',
        'failed-precondition',
      );
    }

    if (usedPlayerIds.has(item.playerId)) {
      throw createRepositoryError(
        'Não repita o mesmo jogador mais de uma vez na partida.',
        'failed-precondition',
      );
    }

    if (item.goals < 0 || item.assists < 0) {
      throw createRepositoryError(
        'Gols e assistências não podem ser negativos.',
        'failed-precondition',
      );
    }

    if (!item.played && (item.goals > 0 || item.assists > 0)) {
      throw createRepositoryError(
        'Um jogador marcado como ausente não pode receber estatísticas.',
        'failed-precondition',
      );
    }

    usedPlayerIds.add(item.playerId);

    return {
      ...item,
      player,
      started: item.started ?? item.played,
    };
  });

  const playedPlayers = resolvedPlayers.filter((item) => item.played);
  if (playedPlayers.length === 0) {
    throw createRepositoryError(
      'A partida precisa ter pelo menos um jogador participante.',
      'failed-precondition',
    );
  }

  const totalGoals = playedPlayers.reduce((sum, item) => sum + item.goals, 0);
  if (totalGoals > input.teamScore) {
    throw createRepositoryError(
      'A soma de gols dos jogadores não pode ultrapassar o placar do time.',
      'failed-precondition',
    );
  }

  return resolvedPlayers;
}

async function createFinishedMatchRecord(input: {
  actorUserId: string;
  team: Team;
  values: RegisterFinishedMatchInput;
  teamPlayers?: Player[];
}) {
  const opponentName = input.values.opponentName.trim();
  if (!opponentName) {
    throw createRepositoryError(
      'Informe o adversario da partida.',
      'failed-precondition',
    );
  }

  if (input.values.teamScore < 0 || input.values.opponentScore < 0) {
    throw createRepositoryError(
      'O placar não pode ter números negativos.',
      'failed-precondition',
    );
  }

  if (
    input.values.linePlayersCount != null &&
    (input.values.linePlayersCount < 1 || input.values.linePlayersCount > 15)
  ) {
    throw createRepositoryError(
      'A quantidade de jogadores de linha precisa ficar entre 1 e 15.',
      'failed-precondition',
    );
  }

  const firestore = requireFirestore();
  const updatedAt = nowIso();
  const teamPlayers = input.teamPlayers ?? (await fetchPlayersByTeamId(input.team.id));
  const resolvedPlayers = resolveFinishedMatchPlayersInput({
    players: input.values.players,
    teamPlayers,
    teamScore: input.values.teamScore,
  });
  const matchRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.matches));
  const match = normalizeMatchDocument({
    id: matchRef.id,
    teamId: input.team.id,
    seasonId: input.values.seasonId ?? input.team.activeSeasonId ?? null,
    date: input.values.date,
    time: normalizeMatchTime(input.values.time),
    venue: normalizeMatchVenue(input.values.venue),
    locationUrl: normalizeOptionalString(input.values.locationUrl),
    opponentName,
    opponentLogoUrl: input.values.opponentLogoUrl ?? null,
    linePlayersCount:
      input.values.linePlayersCount ?? defaultLinePlayersCount(input.values.matchType),
    matchType: input.values.matchType,
    notes: input.values.notes?.trim() ?? '',
    status: 'finished',
    createdBy: input.actorUserId,
    scoreboard: {
      team: input.values.teamScore,
      opponent: input.values.opponentScore,
      result: calculateMatchResult(input.values.teamScore, input.values.opponentScore),
    },
    finishedAt: updatedAt,
    mvpWinnerPlayerIds: [],
    mvpTotalVotes: 0,
    createdAt: updatedAt,
    updatedAt,
  });

  const batch = writeBatch(firestore);
  batch.set(matchRef, match);

  for (const item of resolvedPlayers) {
    const attendanceId = buildStableDocumentId(match.id, item.player.id);
    const attendance = normalizeAttendanceDocument({
      id: attendanceId,
      teamId: input.team.id,
      matchId: match.id,
      playerId: item.player.id,
      userId: item.player.linkedUserId ?? null,
      status: item.played ? 'confirmed' : 'absent',
      respondedAt: updatedAt,
      createdAt: updatedAt,
      updatedAt,
    });
    batch.set(doc(firestore, FIRESTORE_COLLECTIONS.attendance, attendanceId), attendance);

    if (!item.played) {
      continue;
    }

    const matchStatId = buildStableDocumentId(match.id, item.player.id);
    const matchStat = normalizeMatchStatDocument({
      id: matchStatId,
      teamId: input.team.id,
      matchId: match.id,
      playerId: item.player.id,
      played: true,
      started: item.started,
      goals: item.goals,
      assists: item.assists,
      yellowCards: 0,
      redCards: 0,
      notes: '',
      createdAt: updatedAt,
      updatedAt,
    });
    batch.set(doc(firestore, FIRESTORE_COLLECTIONS.matchStats, matchStatId), matchStat);
  }

  await batch.commit();
  await syncPublicTeamProjection(input.team, updatedAt);
  return match;
}

function buildBasicPlayerFromUser(teamId: string, user: User, jerseyNumber: number): Player {
  const createdAt = nowIso();

  return normalizePlayerDocument({
    id: '',
    teamId,
    linkedUserId: user.id,
    linkedEmail: normalizeEmail(user.email),
    fullName: user.displayName.trim() || displayNameFromEmail(user.email),
    nickname: deriveNickname(user.displayName, user.email),
    photoUrl: null,
    jerseyNumber,
    primaryPosition: 'midfielder',
    secondaryPositions: [],
    dominantFoot: 'right',
    status: 'active',
    bio: 'Conta conectada ao time.',
    preferredPosition: 'midfielder',
    allowSelfEditJerseyNumber: false,
    presentationVideoUrl: null,
    introVideoUrl: null,
    celebrationVideoUrl: null,
    manualStats: createEmptyManualStats(),
    createdAt,
    updatedAt: createdAt,
  });
}

function resolveTeamAppRole(
  user: User,
  team: Team,
  membership?: TeamMember | null,
) {
  if (user.appRole === 'owner') {
    return 'owner';
  }

  if (membership?.roles.includes('admin') || team.adminUserId === user.id) {
    return 'team_admin';
  }

  return 'player';
}

async function ensureMembershipPlayerLink(input: {
  user: User;
  membership: TeamMember;
  team: Team;
}) {
  const firestore = requireFirestore();
  const updatedAt = nowIso();
  const normalizedUserEmail = normalizeEmail(input.user.email);
  const teamPlayers = await fetchPlayersByTeamId(input.team.id);
  const resolution = resolvePlayerForUserWithDiagnostics({
    teamPlayers,
    teamId: input.team.id,
    user: input.user,
    membership: input.membership,
  });
  let player = resolution.player;
  const shouldAutoCreatePlayer = membershipIndicatesPlayer(input.membership) && !input.membership.playerId;

  const batch = writeBatch(firestore);
  let hasChanges = false;
  let canUpdateLinkedEmail = true;

  if (player) {
    const resolvedPlayer = player;
    canUpdateLinkedEmail = !teamPlayers.some(
      (candidate) =>
        candidate.id !== resolvedPlayer.id &&
        normalizeEmail(candidate.linkedEmail ?? '') === normalizedUserEmail,
    );
    const normalizedPlayer = normalizePlayerDocument({
      ...resolvedPlayer,
      linkedUserId: input.user.id,
      linkedEmail: canUpdateLinkedEmail
        ? normalizedUserEmail
        : resolvedPlayer.linkedEmail
          ? normalizeEmail(resolvedPlayer.linkedEmail)
          : null,
      updatedAt,
    });

    if (
      normalizedPlayer.linkedUserId !== resolvedPlayer.linkedUserId ||
      normalizedPlayer.linkedEmail !== resolvedPlayer.linkedEmail ||
      normalizedPlayer.updatedAt !== resolvedPlayer.updatedAt
    ) {
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.players, normalizedPlayer.id),
        normalizedPlayer,
      );
      hasChanges = true;
    }

    player = normalizedPlayer;
  } else if (shouldAutoCreatePlayer) {
    const playerRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.players));
    player = normalizePlayerDocument({
      ...buildBasicPlayerFromUser(
        input.team.id,
        input.user,
        await nextJerseyNumber(input.team.id),
      ),
      id: playerRef.id,
      linkedUserId: input.user.id,
      linkedEmail: normalizedUserEmail,
      updatedAt,
    });
    batch.set(playerRef, player);
    hasChanges = true;
  }

  if (__DEV__ && (resolution.source !== 'membership-player-id' || !player)) {
    console.log('[player-linking] ensureMembershipPlayerLink', {
      userId: input.user.id,
      email: normalizedUserEmail,
      teamId: input.team.id,
      membershipId: input.membership.id,
      membershipPlayerId: input.membership.playerId ?? null,
      membershipRoles: input.membership.roles,
      resolvedPlayerId: player?.id ?? null,
      resolutionSource: resolution.source,
      failureReason: resolution.failureReason,
      usedAutoCreate: !resolution.player && Boolean(player) && shouldAutoCreatePlayer,
      updatedLinkedEmail: player ? canUpdateLinkedEmail : false,
    });
  }

  if (!player) {
    return {
      user: input.user,
      membership: input.membership,
      player: null as Player | null,
    };
  }

  let membership = input.membership;
  const nextMembershipRoles: TeamMember['roles'] = membership.roles.includes('player')
    ? membership.roles
    : [...membership.roles, 'player'];

  if (
    membership.playerId !== player.id ||
    nextMembershipRoles.length !== membership.roles.length
  ) {
    membership = buildTeamMemberDocument({
      ...membership,
      playerId: player.id,
      inviteCodeUsed: membership.inviteCodeUsed ?? null,
      roles: nextMembershipRoles,
      canManageTeam: membership.canManageTeam,
      canManagePlayers: membership.canManagePlayers,
      updatedAt,
    });
    batch.set(
      doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, membership.id),
      membership,
    );
    applyFirestoreBatchMutation(batch, buildTeamMembershipIndexMutation(membership));
    hasChanges = true;
  }

  let user = input.user;
  if (
    user.activeTeamId === input.team.id &&
    (user.teamId !== input.team.id ||
      user.playerId !== player.id ||
      resolveTeamAppRole(user, input.team, membership) !== user.appRole)
  ) {
    user = normalizeUserDocument({
      ...user,
      activeTeamId: input.team.id,
      teamId: input.team.id,
      playerId: player.id,
      appRole: resolveTeamAppRole(user, input.team, membership),
      updatedAt,
    });
    batch.set(doc(firestore, FIRESTORE_COLLECTIONS.users, user.id), user);
    hasChanges = true;
  }

  if (hasChanges) {
    await batch.commit();
  }

  await ensureOpenMatchAttendanceForPlayer(player, updatedAt);

  return { user, membership, player };
}

async function ensureCurrentUserPlayerForActiveTeam(userId: string) {
  const actor = await fetchUserById(userId);
  const { user, memberships, teams } = await ensureMembershipsForUser(actor);
  const activeMembership =
    memberships.find((membership) => membership.teamId === user.activeTeamId) ?? null;

  if (!user.activeTeamId || !activeMembership) {
    return null;
  }

  const activeTeam =
    teams.find((team) => team.id === activeMembership.teamId) ?? null;

  if (!activeTeam) {
    return null;
  }

  const repaired = await ensureMembershipPlayerLink({
    user,
    membership: activeMembership,
    team: activeTeam,
  });

  return repaired.player?.id ?? null;
}

async function ensureActiveTeamContext(userId: string) {
  const actor = await fetchUserById(userId);
  let { user, memberships, teams } = await ensureMembershipsForUser(actor);
  const activeTeamId = user.activeTeamId;

  if (!activeTeamId) {
    throw createRepositoryError(
      'Escolha um time antes de continuar.',
      'failed-precondition',
    );
  }

  const membership =
    memberships.find(
      (item) => item.teamId === activeTeamId && item.status === 'active',
    ) ?? null;

  if (!membership) {
    throw createRepositoryError(
      'Seu acesso ao time atual não está disponível.',
      'permission-denied',
    );
  }

  const activeTeam =
    teams.find((team) => team.id === activeTeamId) ?? null;

  if (activeTeam) {
    const repaired = await ensureMembershipPlayerLink({
      user,
      membership,
      team: activeTeam,
    });
    user = repaired.user;
    memberships = memberships.map((item) =>
      item.id === repaired.membership.id ? repaired.membership : item,
    );

    return {
      actor: user,
      membership: repaired.membership,
      activeTeamId,
    };
  }

  return {
    actor: user,
    membership,
    activeTeamId,
  };
}

async function ensureMembershipContext(userId: string, teamId: string) {
  const context = await ensureActiveTeamContext(userId);

  if (context.activeTeamId !== teamId) {
    throw createRepositoryError(
      'Troque para o time atual antes de continuar.',
      'permission-denied',
    );
  }

  return context;
}

async function ensureTeamAdmin(userId: string, teamId: string) {
  const { actor, membership } = await ensureMembershipContext(userId, teamId);

  if (!membership?.canManageTeam) {
    throw createRepositoryError(
      'Apenas o administrador do time pode fazer essa acao.',
      'permission-denied',
    );
  }

  return { actor, membership };
}

async function ensureTeamOwner(userId: string, teamId: string) {
  const { actor } = await ensureMembershipContext(userId, teamId);
  const team = await fetchTeamById(teamId);

  if (team.adminUserId !== actor.id) {
    throw createRepositoryError(
      'Apenas quem criou o time pode excluir definitivamente.',
      'permission-denied',
    );
  }

  return { actor, team };
}

async function ensurePlayerManager(userId: string, teamId: string) {
  const { actor, membership } = await ensureMembershipContext(userId, teamId);

  if (!membership?.canManagePlayers) {
    throw createRepositoryError(
      'Apenas quem gerencia o elenco pode fazer essa acao.',
      'permission-denied',
    );
  }

  return { actor, membership };
}

function resolveNextActiveMembershipForUserAfterTeamDeletion(input: {
  user: User;
  deletedTeamId: string;
  memberships: TeamMember[];
  teamsById: Map<string, Team>;
}) {
  const remainingMemberships = sortMembershipsByPriority(
    input.memberships.filter(
      (membership) =>
        membership.status === 'active' &&
        membership.teamId !== input.deletedTeamId &&
        input.teamsById.has(membership.teamId),
    ),
  );

  return (
    remainingMemberships.find((membership) => membership.teamId === input.user.activeTeamId) ??
    remainingMemberships[0] ??
    null
  );
}

async function commitFirestoreBatchMutations(mutations: FirestoreBatchMutation[]) {
  const firestore = requireFirestore();

  for (let index = 0; index < mutations.length; index += FIRESTORE_BATCH_WRITE_LIMIT) {
    const batch = writeBatch(firestore);

    for (const mutation of mutations.slice(index, index + FIRESTORE_BATCH_WRITE_LIMIT)) {
      applyFirestoreBatchMutation(batch, mutation);
    }

    await batch.commit();
  }
}

async function ensureSelfPlayerEdit(userId: string, player: Player) {
  const { actor, membership } = await ensureMembershipContext(userId, player.teamId);
  const ownPlayerId = membership?.roles.includes('player')
    ? await ensureCurrentUserPlayerForActiveTeam(userId)
    : null;

  if (!membership?.roles.includes('player') || ownPlayerId !== player.id) {
    throw createRepositoryError(
      'Você não tem permissão para editar esse jogador.',
      'permission-denied',
    );
  }

  return { actor, membership };
}

async function upsertTeamMemberDocument(input: {
  userId: string;
  teamId: string;
  playerId: string | null;
  inviteCodeUsed?: string | null;
  roles: TeamMember['roles'];
  canManageTeam?: boolean;
  canManagePlayers?: boolean;
  createdAt: string;
  updatedAt: string;
  joinedAt?: string;
  status?: TeamMember['status'];
}) {
  const firestore = requireFirestore();
  const existingMembership = await fetchTeamMemberByUserAndTeam(
    input.userId,
    input.teamId,
  );
  const membershipRef = existingMembership
    ? doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, existingMembership.id)
    : doc(collection(firestore, FIRESTORE_COLLECTIONS.teamMembers));
  const roles = [
    ...new Set([...(existingMembership?.roles ?? []), ...input.roles]),
  ];
  const membership = buildTeamMemberDocument({
    id: membershipRef.id,
    userId: input.userId,
    teamId: input.teamId,
    playerId: input.playerId,
    inviteCodeUsed:
      input.inviteCodeUsed !== undefined
        ? input.inviteCodeUsed
        : existingMembership?.inviteCodeUsed ?? null,
    roles,
    canManageTeam:
      input.canManageTeam ?? existingMembership?.canManageTeam ?? roles.includes('admin'),
    canManagePlayers:
      input.canManagePlayers ??
      existingMembership?.canManagePlayers ??
      roles.includes('admin'),
    createdAt: existingMembership?.createdAt ?? input.createdAt,
    updatedAt: input.updatedAt,
    joinedAt: existingMembership?.joinedAt ?? input.joinedAt ?? input.createdAt,
    status: input.status ?? existingMembership?.status ?? 'active',
  });

  const batch = writeBatch(firestore);
  batch.set(membershipRef, membership);
  applyFirestoreBatchMutation(batch, buildTeamMembershipIndexMutation(membership));
  await batch.commit();
  return membership;
}

async function linkPlayerToUserIfEmailMatches(input: {
  team: Team;
  player: Pick<Player, 'id' | 'linkedUserId' | 'linkedEmail'>;
  linkedUserId?: string | null;
  linkedEmail?: string | null;
  currentPlayerId?: string;
  preferredUser?: User | null;
}) {
  const normalizedLinkedEmail = normalizeEmail(
    input.linkedEmail ?? input.player.linkedEmail,
  );
  let linkedUser =
    typeof input.linkedUserId === 'string' && input.linkedUserId
      ? await fetchUserById(input.linkedUserId)
      : null;

  if (
    !linkedUser &&
    input.preferredUser &&
    normalizedLinkedEmail &&
    normalizeEmail(input.preferredUser.email) === normalizedLinkedEmail
  ) {
    linkedUser = input.preferredUser;
  }

  if (!linkedUser && normalizedLinkedEmail) {
    try {
      linkedUser = await fetchUserByEmail(normalizedLinkedEmail);
    } catch (error) {
      if (extractErrorCode(error) !== 'permission-denied') {
        throw error;
      }

      if (__DEV__) {
        console.warn(
          '[auth-link] permission-denied',
          JSON.stringify(
            {
              stage: 'fetch-user-by-email-for-player-link',
              email: normalizedLinkedEmail,
              code: extractErrorCode(error),
              message: error instanceof Error ? error.message : 'Erro desconhecido.',
              context: error instanceof Error ? (error as ErrorWithCode).context : undefined,
            },
            null,
            2,
          ),
        );
      }

      linkedUser = null;
    }
  }

  if (!linkedUser) {
    return {
      linkedUser: null,
      linkedUserId: null,
      linkedEmail: normalizedLinkedEmail || null,
    };
  }

  await validateLinkedUserAssignment(
    linkedUser.id,
    input.team.id,
    input.currentPlayerId ?? input.player.id,
  );

  return {
    linkedUser,
    linkedUserId: linkedUser.id,
    linkedEmail: normalizeEmail(linkedUser.email),
  };
}

async function syncLinkedUserMembership(input: {
  linkedUser: User;
  team: Team;
  playerId: string;
  updatedAt: string;
}) {
  const roles: TeamMember['roles'] =
    input.team.adminUserId === input.linkedUser.id ? ['admin', 'player'] : ['player'];
  const membership = await upsertTeamMemberDocument({
    userId: input.linkedUser.id,
    teamId: input.team.id,
    playerId: input.playerId,
    roles,
    canManageTeam: roles.includes('admin'),
    canManagePlayers: roles.includes('admin'),
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
    joinedAt: input.linkedUser.createdAt,
  });

  if (
    input.linkedUser.activeTeamId === null ||
    input.linkedUser.activeTeamId === input.team.id
  ) {
    await persistUserContext(
      input.linkedUser,
      membership,
      new Map([[input.team.id, input.team]]),
    );
  }

  return membership;
}

async function clearLinkedUserMembershipPlayer(input: {
  linkedUserId: string;
  team: Team;
  playerId: string;
  updatedAt: string;
}) {
  const membership = await fetchTeamMemberByUserAndTeam(
    input.linkedUserId,
    input.team.id,
  );

  if (!membership || membership.playerId !== input.playerId) {
    return;
  }

  const firestore = requireFirestore();
  const updatedMembership = buildTeamMemberDocument({
    ...membership,
    playerId: null,
    updatedAt: input.updatedAt,
  });
  await commitFirestoreBatchMutations([
    {
      type: 'set',
      ref: doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, membership.id),
      data: updatedMembership,
    },
    buildTeamMembershipIndexMutation(updatedMembership),
  ]);

  const linkedUser = await fetchUserById(input.linkedUserId);
  if (
    linkedUser.activeTeamId === input.team.id ||
    linkedUser.playerId === input.playerId
  ) {
    await persistUserContext(
      linkedUser,
      updatedMembership,
      new Map([[input.team.id, input.team]]),
    );
  }
}

export const firebaseRepository: AppRepository = {
  getMode() {
    return 'firebase';
  },

  async getInitialSnapshot() {
    try {
      return await buildSnapshotForCurrentUser();
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível carregar os dados iniciais agora.',
      );
    }
  },

  async getSnapshot() {
    try {
      return await buildSnapshotForCurrentUser();
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível atualizar os dados agora.',
      );
    }
  },

  async listPublicTeams(actorUserId?: string | null) {
    try {
      const firestore = requireFirestore();
      void actorUserId;
      const publicTeamsSnapshot = await getDocs(
        collection(firestore, FIRESTORE_COLLECTIONS.publicTeams),
      );
      const publicTeams = publicTeamsSnapshot.docs.map((item) =>
        normalizePublicTeamDocument(parseDoc<FirestorePublicTeamDocument>(item)),
      );
      const summaries = publicTeams
        .map((team) => toPublicTeamSummary(team))
        .sort((left, right) => {
          const stateOrder = left.state.localeCompare(right.state);

          if (stateOrder !== 0) {
            return stateOrder;
          }

          const cityOrder = left.city.localeCompare(right.city);

          if (cityOrder !== 0) {
            return cityOrder;
          }

          return left.name.localeCompare(right.name);
        });

      return summaries;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível carregar a galeria de times agora.',
      );
    }
  },

  async getPublicTeamProfile(teamId: string, actorUserId?: string | null) {
    try {
      void actorUserId;
      const team = await fetchPublicTeamById(teamId);
      return team ? toPublicTeamProfile(team) : null;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível carregar o perfil público do time agora.',
      );
    }
  },

  async subscribeSnapshot(currentUserId: string, handlers: SnapshotSubscriptionHandlers) {
    const firestore = requireFirestore();
    const initialSnapshot = await buildSnapshotForUserId(currentUserId);
    const state = createRealtimeStateFromSnapshot(initialSnapshot);
    const teamListeners = new Map<string, Unsubscribe>();
    const activeTeamListeners = new Map<string, Unsubscribe>();
    let disposed = false;
    let activeTeamId =
      resolveActiveMembership(state.user, state.memberships)?.teamId ?? null;

    const emitSnapshot = () => {
      if (disposed) {
        return;
      }

      handlers.onSnapshot(buildSnapshotFromRealtimeState(state));
    };

    const handleRealtimeError = (error: FirestoreError | Error) => {
      if (disposed) {
        return;
      }

      handlers.onError?.(
        toFriendlyFirestoreError(
          error,
          'Não foi possível atualizar os dados do time agora.',
        ),
      );
    };

    const clearActiveTeamData = () => {
      state.ratingCriteria = [];
      state.players = [];
      state.matches = [];
      state.lineups = [];
      state.attendance = [];
      state.matchStats = [];
      state.matchDiaryEntries = [];
      state.mvpVotes = [];
      state.playerRatings = [];
      state.notifications = [];
      state.seasons = [];
    };

    const disposeActiveTeamListeners = () => {
      for (const unsubscribe of activeTeamListeners.values()) {
        unsubscribe();
      }

      activeTeamListeners.clear();
    };

    const syncTeamListeners = (memberships: TeamMember[]) => {
      const nextTeamIds = [...new Set(memberships.map((membership) => membership.teamId))];

      for (const [teamId, unsubscribe] of teamListeners.entries()) {
        if (nextTeamIds.includes(teamId)) {
          continue;
        }

        unsubscribe();
        teamListeners.delete(teamId);
        state.teamsById.delete(teamId);
      }

      for (const teamId of nextTeamIds) {
        if (teamListeners.has(teamId)) {
          continue;
        }

        teamListeners.set(
          teamId,
          onSnapshot(
            doc(firestore, FIRESTORE_COLLECTIONS.teams, teamId),
            (snapshot) => {
              if (!snapshot.exists()) {
                state.teamsById.delete(teamId);
                emitSnapshot();
                return;
              }

              state.teamsById.set(
                teamId,
                normalizeTeamDocument(parseDoc<FirestoreTeamDocument>(snapshot)),
              );
              emitSnapshot();
            },
            handleRealtimeError,
          ),
        );
      }
    };

    const bindActiveTeamListeners = (nextActiveTeamId: string | null) => {
      if (activeTeamId === nextActiveTeamId && activeTeamListeners.size > 0) {
        return;
      }

      activeTeamId = nextActiveTeamId;
      disposeActiveTeamListeners();
      clearActiveTeamData();
      if (nextActiveTeamId) {
        state.accessNotice = null;
      }

      if (!nextActiveTeamId) {
        emitSnapshot();
        return;
      }

      const listenToTeamCollection = <TDocument extends { id: string }>(
        key: string,
        collectionName: (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS],
        normalize: (item: TDocument) => TDocument,
        assign: (items: TDocument[]) => void,
      ) => {
        activeTeamListeners.set(
          key,
          onSnapshot(
            query(
              collection(firestore, collectionName),
              where('teamId', '==', nextActiveTeamId),
            ),
            (snapshot) => {
              assign(
                snapshot.docs.map((item) =>
                  normalize(parseDoc<TDocument>(item)),
                ),
              );
              emitSnapshot();
            },
            handleRealtimeError,
          ),
        );
      };

      const listenToAccessibleNotifications = () => {
        let teamWideNotifications: AppNotification[] = [];
        let targetedNotifications: AppNotification[] = [];

        const emitNotifications = () => {
          state.notifications = dedupeNotifications([
            ...teamWideNotifications,
            ...targetedNotifications,
          ]);
          emitSnapshot();
        };

        activeTeamListeners.set(
          'notifications:teamWide',
          onSnapshot(
            query(
              collection(firestore, FIRESTORE_COLLECTIONS.notifications),
              where('teamId', '==', nextActiveTeamId),
              where('targetUserId', '==', null),
            ),
            (snapshot) => {
              teamWideNotifications = snapshot.docs.map((item) =>
                normalizeNotificationDocument(
                  parseDoc<FirestoreNotificationDocument>(item),
                ),
              );
              emitNotifications();
            },
            handleRealtimeError,
          ),
        );

        activeTeamListeners.set(
          'notifications:targeted',
          onSnapshot(
            query(
              collection(firestore, FIRESTORE_COLLECTIONS.notifications),
              where('teamId', '==', nextActiveTeamId),
              where('targetUserId', '==', currentUserId),
            ),
            (snapshot) => {
              targetedNotifications = snapshot.docs.map((item) =>
                normalizeNotificationDocument(
                  parseDoc<FirestoreNotificationDocument>(item),
                ),
              );
              emitNotifications();
            },
            handleRealtimeError,
          ),
        );
      };

      listenToTeamCollection<FirestoreTeamRatingCriterionDocument>(
        'ratingCriteria',
        FIRESTORE_COLLECTIONS.ratingCriteria,
        normalizeTeamRatingCriterionDocument,
        (items) => {
          state.ratingCriteria = normalizeRatingCriteriaOrder(items);
        },
      );
      listenToTeamCollection<FirestorePlayerDocument>(
        'players',
        FIRESTORE_COLLECTIONS.players,
        normalizePlayerDocument,
        (items) => {
          state.players = items;
        },
      );
      listenToTeamCollection<FirestoreMatchDocument>(
        'matches',
        FIRESTORE_COLLECTIONS.matches,
        normalizeMatchDocument,
        (items) => {
          state.matches = items;
        },
      );
      listenToTeamCollection<FirestoreLineupDocument>(
        'lineups',
        FIRESTORE_COLLECTIONS.lineups,
        normalizeLineupDocument,
        (items) => {
          state.lineups = items;
        },
      );
      listenToTeamCollection<FirestoreAttendanceDocument>(
        'attendance',
        FIRESTORE_COLLECTIONS.attendance,
        normalizeAttendanceDocument,
        (items) => {
          state.attendance = items;
        },
      );
      listenToTeamCollection<FirestoreMatchStatDocument>(
        'matchStats',
        FIRESTORE_COLLECTIONS.matchStats,
        normalizeMatchStatDocument,
        (items) => {
          state.matchStats = items;
        },
      );
      listenToTeamCollection<FirestoreMatchDiaryEntryDocument>(
        'matchDiaryEntries',
        FIRESTORE_COLLECTIONS.matchDiaryEntries,
        normalizeMatchDiaryEntryDocument,
        (items) => {
          state.matchDiaryEntries = sortMatchDiaryEntries(items);
        },
      );
      listenToTeamCollection<FirestoreMvpVoteDocument>(
        'mvpVotes',
        FIRESTORE_COLLECTIONS.mvpVotes,
        normalizeMvpVoteDocument,
        (items) => {
          state.mvpVotes = items;
        },
      );
      listenToTeamCollection<FirestorePlayerRatingDocument>(
        'playerRatings',
        FIRESTORE_COLLECTIONS.playerRatings,
        normalizePlayerRatingDocument,
        (items) => {
          state.playerRatings = items;
        },
      );
      listenToAccessibleNotifications();
      listenToTeamCollection<FirestoreSeasonDocument>(
        'seasons',
        FIRESTORE_COLLECTIONS.seasons,
        (item) => item,
        (items) => {
          state.seasons = items;
        },
      );

      emitSnapshot();
    };

    syncTeamListeners(state.memberships);
    bindActiveTeamListeners(activeTeamId);
    emitSnapshot();

    const userUnsubscribe = onSnapshot(
      doc(firestore, FIRESTORE_COLLECTIONS.users, currentUserId),
      (snapshot) => {
        if (!snapshot.exists()) {
          state.user = null;
          state.memberships = [];
          state.teamsById.clear();
          state.accessNotice = null;
          syncTeamListeners([]);
          bindActiveTeamListeners(null);
          emitSnapshot();
          return;
        }

        state.user = normalizeUserDocument(parseDoc<FirestoreUserDocument>(snapshot));
        syncTeamListeners(state.memberships);
        bindActiveTeamListeners(
          resolveActiveMembership(state.user, state.memberships)?.teamId ?? null,
        );
        emitSnapshot();
      },
      handleRealtimeError,
    );

    const membershipsUnsubscribe = onSnapshot(
      query(
        collection(firestore, FIRESTORE_COLLECTIONS.teamMembers),
        where('userId', '==', currentUserId),
      ),
      (snapshot) => {
        state.memberships = sortMembershipsByPriority(
          snapshot.docs.map((item) =>
            normalizeTeamMemberDocument(parseDoc<FirestoreTeamMemberDocument>(item)),
          ),
        );
        syncTeamListeners(state.memberships);
        bindActiveTeamListeners(
          resolveActiveMembership(state.user, state.memberships)?.teamId ?? null,
        );
        emitSnapshot();
      },
      handleRealtimeError,
    );

    return () => {
      disposed = true;
      userUnsubscribe();
      membershipsUnsubscribe();
      disposeActiveTeamListeners();

      for (const unsubscribe of teamListeners.values()) {
        unsubscribe();
      }

      teamListeners.clear();
    };
  },

  async login(input) {
    try {
      await authService.login(input);
      let user = await ensureCurrentUserDocumentAfterLogin();

      if (!user) {
        throw createRepositoryError('Não foi possível abrir a sessão do usuário.');
      }

      try {
        user = await repairActiveTeam(user);
      } catch (error) {
        if (extractErrorCode(error) !== 'permission-denied') {
          throw error;
        }
      }

      return user;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível entrar agora.',
      );
    }
  },

  async loginWithGoogle(input: GoogleLoginInput) {
    try {
      await authService.loginWithGoogle(input);
      let user = await ensureCurrentUserDocumentAfterLogin();

      if (!user) {
        throw createRepositoryError('Não foi possível abrir a sessão do usuário.');
      }

      try {
        user = await repairActiveTeam(user);
      } catch (error) {
        if (extractErrorCode(error) !== 'permission-denied') {
          throw error;
        }
      }

      return user;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível entrar com Google agora.',
      );
    }
  },

  async register(input) {
    try {
      await authService.register(input);
      let user = await ensureCurrentUserDocumentAfterLogin();

      if (!user) {
        throw createRepositoryError('Não foi possível criar a conta agora.');
      }

      try {
        user = await repairActiveTeam(user);
      } catch (error) {
        if (extractErrorCode(error) !== 'permission-denied') {
          throw error;
        }
      }

      return user;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível criar a conta agora.',
      );
    }
  },

  async resetPassword(email) {
    await authService.resetPassword(email);
  },

  async createTeam(input: CreateTeamInput, adminUserId: string) {
    try {
      const firestore = requireFirestore();
      const admin = await fetchUserById(adminUserId);
      const ownedTeamsCount = await getOwnedTeamsCount(adminUserId);

      if (!canCreateTeamFromOwnedTeamsCount(ownedTeamsCount)) {
        throw createRepositoryError(
          OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
          'failed-precondition',
        );
      }

      const teamRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.teams));
      const ownerPlayerRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.players));
      const membershipRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.teamMembers));
      const now = nowIso();
      const inviteCode = await createUniqueInviteCode();
      const ratingCriteria = createDefaultTeamRatingCriteria(teamRef.id, now);
      const team: FirestoreTeamDocument = normalizeTeamDocument({
        id: teamRef.id,
        name: input.name.trim(),
        slug: slugifyTeamName(input.name),
        logoUrl: input.logoUrl?.trim() || null,
        bannerUrl: input.bannerUrl?.trim() || null,
        presentationVideoUrl: input.presentationVideoUrl?.trim() || null,
        isPublic: false,
        city: null,
        state: null,
        neighborhood: null,
        homeFieldName: null,
        contactName: null,
        contactPhone: null,
        contactWhatsapp: null,
        publicDescription: null,
        allowFriendlyContact: false,
        publicRosterEnabled: false,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        accentColor: input.accentColor ?? null,
        description: input.description?.trim() ?? '',
        inviteCode,
        inviteCodeUpdatedAt: now,
        coachName: input.coachName.trim(),
        adminUserId,
        activeSeasonId: null,
        createdAt: now,
        updatedAt: now,
      });
      const ownerPlayer = normalizePlayerDocument({
        ...buildBasicPlayerFromUser(team.id, admin, 10),
        id: ownerPlayerRef.id,
        linkedUserId: admin.id,
        linkedEmail: normalizeEmail(admin.email),
        allowSelfEditJerseyNumber: true,
        createdAt: now,
        updatedAt: now,
      });
      const membership = buildTeamMemberDocument({
        id: membershipRef.id,
        userId: admin.id,
        teamId: team.id,
        playerId: ownerPlayer.id,
        inviteCodeUsed: null,
        roles: ['admin', 'player'],
        canManageTeam: true,
        canManagePlayers: true,
        createdAt: now,
        updatedAt: now,
        joinedAt: now,
      });

      const updatedAdmin: FirestoreUserDocument = normalizeUserDocument({
        ...admin,
        appRole: resolveTeamAppRole(admin, team, membership),
        activeTeamId: team.id,
        teamId: team.id,
        playerId: ownerPlayer.id,
        updatedAt: now,
      });

      const batch = writeBatch(firestore);
      batch.set(teamRef, team);
      for (const mutation of buildTeamInviteSyncMutations(team)) {
        if (mutation.type === 'set' && mutation.data) {
          batch.set(mutation.ref, mutation.data);
        }
      }
      batch.set(ownerPlayerRef, ownerPlayer);
      batch.set(membershipRef, membership);
      applyFirestoreBatchMutation(batch, buildTeamMembershipIndexMutation(membership));
      for (const criterion of ratingCriteria) {
        batch.set(
          doc(firestore, FIRESTORE_COLLECTIONS.ratingCriteria, criterion.id),
          criterion,
        );
      }
      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.users, admin.id), updatedAdmin);
      await batch.commit();

      return team;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível criar o time agora.',
      );
    }
  },

  async updateTeam(teamId: string, input: UpdateTeamInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      await ensureTeamAdmin(actorUserId, teamId);
      const currentTeam = await fetchTeamById(teamId);
      const updatedAt = nowIso();
      const publicProfile = normalizeTeamPublicProfileFields({
        isPublic: input.isPublic ?? currentTeam.isPublic,
        city: input.city !== undefined ? input.city : currentTeam.city,
        state: input.state !== undefined ? input.state : currentTeam.state,
        neighborhood:
          input.neighborhood !== undefined
            ? input.neighborhood
            : currentTeam.neighborhood,
        homeFieldName:
          input.homeFieldName !== undefined
            ? input.homeFieldName
            : currentTeam.homeFieldName,
        contactName:
          input.contactName !== undefined ? input.contactName : currentTeam.contactName,
        contactPhone:
          input.contactPhone !== undefined ? input.contactPhone : currentTeam.contactPhone,
        contactWhatsapp:
          input.contactWhatsapp !== undefined
            ? input.contactWhatsapp
            : currentTeam.contactWhatsapp,
        publicDescription:
          input.publicDescription !== undefined
            ? input.publicDescription
            : currentTeam.publicDescription,
        allowFriendlyContact:
          input.allowFriendlyContact !== undefined
            ? input.allowFriendlyContact
            : currentTeam.allowFriendlyContact,
        publicRosterEnabled:
          input.publicRosterEnabled !== undefined
            ? input.publicRosterEnabled
            : currentTeam.publicRosterEnabled,
      });

      validateTeamPublicProfileFields(publicProfile);

      const updatedTeam = normalizeTeamDocument({
        ...currentTeam,
        name: input.name.trim(),
        coachName: input.coachName.trim(),
        slug: slugifyTeamName(input.slug.trim() || input.name),
        logoUrl: input.logoUrl?.trim() || null,
        bannerUrl:
          input.bannerUrl !== undefined
            ? input.bannerUrl?.trim() || null
            : currentTeam.bannerUrl ?? null,
        presentationVideoUrl:
          input.presentationVideoUrl !== undefined
            ? input.presentationVideoUrl?.trim() || null
            : currentTeam.presentationVideoUrl ?? null,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        accentColor: input.accentColor ?? null,
        description: input.description?.trim() ?? '',
        isPublic: publicProfile.isPublic,
        city: publicProfile.city,
        state: publicProfile.state,
        neighborhood: publicProfile.neighborhood,
        homeFieldName: publicProfile.homeFieldName,
        contactName: publicProfile.contactName,
        contactPhone: publicProfile.contactPhone,
        contactWhatsapp: publicProfile.contactWhatsapp,
        publicDescription: publicProfile.publicDescription,
        allowFriendlyContact: publicProfile.allowFriendlyContact,
        publicRosterEnabled: publicProfile.publicRosterEnabled,
        updatedAt,
      });
      const publicTeam = await buildPublicTeamProjection(updatedTeam, updatedAt);
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.teams, currentTeam.id), updatedTeam);
      for (const mutation of buildPublicTeamSyncMutations(updatedTeam.id, publicTeam)) {
        if (mutation.type === 'set' && mutation.data) {
          batch.set(mutation.ref, mutation.data);
          continue;
        }

        batch.delete(mutation.ref);
      }
      await batch.commit();
      return updatedTeam;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível salvar as configurações do time.',
      );
    }
  },

  async deleteTeamPermanently(teamId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { team } = await ensureTeamOwner(actorUserId, teamId);
      const [
        teamMembers,
        usersWithDeletedTeamAsActive,
        players,
        matches,
        lineups,
        attendance,
        matchStats,
        matchDiaryEntries,
        mvpVotes,
        playerRatings,
        ratingCriteria,
        notifications,
        seasons,
      ] = await Promise.all([
        fetchTeamMembersByTeamId(teamId),
        fetchUsersByTeamId(teamId),
        fetchPlayersByTeamId(teamId),
        fetchMatchesByTeamId(teamId),
        fetchLineupsByTeamId(teamId),
        fetchAttendanceByTeamId(teamId),
        fetchMatchStatsByTeamId(teamId),
        fetchMatchDiaryEntriesByTeamId(teamId),
        fetchMvpVotesByTeamId(teamId),
        fetchPlayerRatingsByTeamId(teamId),
        fetchRatingCriteriaByTeamId(teamId),
        fetchAllNotificationsByTeamId(teamId),
        fetchSeasonsByTeamId(teamId),
      ]);

      const affectedUserIds = [
        ...new Set([
          ...teamMembers.map((membership) => membership.userId),
          ...usersWithDeletedTeamAsActive.map((user) => user.id),
        ]),
      ];
      const [affectedUsers, membershipsByUser] = await Promise.all([
        Promise.all(affectedUserIds.map((userId) => fetchUserById(userId))),
        Promise.all(affectedUserIds.map((userId) => fetchTeamMembersByUserId(userId))),
      ]);
      const remainingTeamIds = [
        ...new Set(
          membershipsByUser
            .flat()
            .filter(
              (membership) =>
                membership.status === 'active' && membership.teamId !== teamId,
            )
            .map((membership) => membership.teamId),
        ),
      ];
      const remainingTeams = (
        await Promise.allSettled(
          remainingTeamIds.map((remainingTeamId) => fetchTeamById(remainingTeamId)),
        )
      )
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<Team> => result.status === 'fulfilled',
        )
        .map((result) => result.value);
      const remainingTeamsById = new Map(
        remainingTeams.map((remainingTeam) => [remainingTeam.id, remainingTeam]),
      );
      const updatedUsers = affectedUsers.map((user, index) => {
        const nextMembership = resolveNextActiveMembershipForUserAfterTeamDeletion({
          user,
          deletedTeamId: teamId,
          memberships: membershipsByUser[index] ?? [],
          teamsById: remainingTeamsById,
        });

        return buildUserContextDocument(user, nextMembership, remainingTeamsById);
      });
      const mutations: FirestoreBatchMutation[] = [
        ...updatedUsers.map((user) => ({
          type: 'set' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.users, user.id),
          data: user,
        })),
        ...teamMembers.map((membership) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, membership.id),
        })),
        ...teamMembers.map((membership) =>
          buildTeamMembershipIndexDeleteMutation(membership.teamId, membership.userId),
        ),
        {
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.teams, team.id),
        },
        {
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.publicTeams, team.id),
        },
        {
          type: 'delete' as const,
          ref: doc(
            firestore,
            FIRESTORE_COLLECTIONS.teamInvites,
            normalizeInviteCode(team.inviteCode),
          ),
        },
        ...players.map((player) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.players, player.id),
        })),
        ...matches.map((match) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.matches, match.id),
        })),
        ...lineups.map((lineup) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.lineups, lineup.id),
        })),
        ...attendance.map((record) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.attendance, record.id),
        })),
        ...matchStats.map((stat) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.matchStats, stat.id),
        })),
        ...matchDiaryEntries.map((entry) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.matchDiaryEntries, entry.id),
        })),
        ...mvpVotes.map((vote) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.mvpVotes, vote.id),
        })),
        ...playerRatings.map((rating) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.playerRatings, rating.id),
        })),
        ...ratingCriteria.map((criterion) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.ratingCriteria, criterion.id),
        })),
        ...notifications.map((notification) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.notifications, notification.id),
        })),
        ...seasons.map((season) => ({
          type: 'delete' as const,
          ref: doc(firestore, FIRESTORE_COLLECTIONS.seasons, season.id),
        })),
      ];

      await commitFirestoreBatchMutations(mutations);

      try {
        await deleteTeamStorageAssets(teamId);
      } catch (error) {
        console.warn('[team-delete] storage cleanup warning', {
          teamId,
          error,
        });
        throw createTeamDeletionStorageWarningError();
      }
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'NÃ£o foi possÃ­vel excluir o time agora.',
      );
    }
  },

  async regenerateTeamInviteCode(teamId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      await ensureTeamAdmin(actorUserId, teamId);
      const currentTeam = await fetchTeamById(teamId);
      const updatedAt = nowIso();

      const updatedTeam = normalizeTeamDocument({
        ...currentTeam,
        inviteCode: await createUniqueInviteCode(currentTeam.id),
        inviteCodeUpdatedAt: updatedAt,
        updatedAt,
      });
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.teams, currentTeam.id), updatedTeam);
      for (const mutation of buildTeamInviteSyncMutations(updatedTeam, {
        previousInviteCode: currentTeam.inviteCode,
      })) {
        if (mutation.type === 'set' && mutation.data) {
          batch.set(mutation.ref, mutation.data);
          continue;
        }

        batch.delete(mutation.ref);
      }
      await batch.commit();
      return updatedTeam;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível gerar um novo código agora.',
      );
    }
  },

  async createRatingCriterion(input: CreateRatingCriterionInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { activeTeamId } = await ensureActiveTeamContext(actorUserId);
      await ensureTeamAdmin(actorUserId, activeTeamId);
      const now = nowIso();
      const existingCriteria = await loadTeamRatingCriteria(activeTeamId);
      const activeCount = getActiveRatingCriteria(existingCriteria).length;
      const shouldActivate = input.active !== false;

      if (shouldActivate && activeCount >= 12) {
        throw createRepositoryError(
          'Use no máximo 12 critérios ativos por time.',
          'failed-precondition',
        );
      }

      const criterionRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.ratingCriteria));
      const nextCriteria = [
        ...existingCriteria,
        normalizeTeamRatingCriterion({
          id: criterionRef.id,
          teamId: activeTeamId,
          label: input.label,
          description: input.description ?? null,
          type: input.type,
          weight: input.weight ?? 1,
          active: shouldActivate,
          order: existingCriteria.length,
          createdAt: now,
          updatedAt: now,
        }),
      ];

      const persistedCriteria = await persistTeamRatingCriteria(nextCriteria);
      return persistedCriteria.find((criterion) => criterion.id === criterionRef.id)!;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível criar o critério agora.',
      );
    }
  },

  async updateRatingCriterion(
    criterionId: string,
    input: UpdateRatingCriterionInput,
    actorUserId: string,
  ) {
    try {
      const { activeTeamId } = await ensureActiveTeamContext(actorUserId);
      await ensureTeamAdmin(actorUserId, activeTeamId);
      const criterion = await fetchRatingCriterionByIdForTeam(activeTeamId, criterionId);

      if (!criterion) {
        throw createRepositoryError(
          'Critério de avaliação não encontrado.',
          'not-found',
        );
      }

      const nextCriteria = (await loadTeamRatingCriteria(activeTeamId)).map((item) =>
        item.id === criterion.id
          ? normalizeTeamRatingCriterion({
              ...item,
              label: input.label ?? item.label,
              description:
                input.description !== undefined ? input.description : item.description ?? null,
              type: input.type ?? item.type,
              weight: input.weight ?? item.weight,
              active: input.active ?? item.active,
              order: input.order ?? item.order,
              updatedAt: nowIso(),
            })
          : item,
      );
      const activeCount = getActiveRatingCriteria(nextCriteria).length;

      if (activeCount > 12) {
        throw createRepositoryError(
          'Use no máximo 12 critérios ativos por time.',
          'failed-precondition',
        );
      }

      const persistedCriteria = await persistTeamRatingCriteria(nextCriteria);
      return persistedCriteria.find((item) => item.id === criterion.id)!;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível atualizar o critério agora.',
      );
    }
  },

  async deleteRatingCriterion(criterionId: string, actorUserId: string) {
    try {
      const { activeTeamId } = await ensureActiveTeamContext(actorUserId);
      await ensureTeamAdmin(actorUserId, activeTeamId);
      const criterion = await fetchRatingCriterionByIdForTeam(activeTeamId, criterionId);

      if (!criterion) {
        throw createRepositoryError(
          'Critério de avaliação não encontrado.',
          'not-found',
        );
      }

      const teamCriteria = await loadTeamRatingCriteria(activeTeamId);
      const ratings = await fetchPlayerRatingsByTeamId(activeTeamId);
      const usedCount = countRatingCriterionUsage(ratings, criterion.id);

      if (usedCount > 0) {
        const nextCriteria = teamCriteria.map((item) =>
          item.id === criterion.id
            ? normalizeTeamRatingCriterion({
                ...item,
                active: false,
                updatedAt: nowIso(),
              })
            : item,
        );
        await persistTeamRatingCriteria(nextCriteria);
        return;
      }

      const nextCriteria = teamCriteria.filter((item) => item.id !== criterion.id);
      await persistTeamRatingCriteria(nextCriteria, [criterion.id]);
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível remover o critério agora.',
      );
    }
  },

  async setActiveTeam(teamId: string, userId: string) {
    try {
      const user = await fetchUserById(userId);
      const { memberships, teams } = await ensureMembershipsForUser(user);
      const membership =
        memberships.find(
          (item) => item.teamId === teamId && item.status === 'active',
        ) ?? null;

      if (!membership) {
        throw createRepositoryError(
          'Você ainda não participa desse time.',
          'permission-denied',
        );
      }

      const teamsById = new Map(teams.map((team) => [team.id, team]));
      await persistUserContext(user, membership, teamsById);
      return normalizeUserDocument({
        ...user,
        activeTeamId: membership.teamId,
        teamId: membership.teamId,
        playerId: membership.playerId,
        appRole: resolveTeamAppRole(
          user,
          teamsById.get(membership.teamId) ?? (await fetchTeamById(membership.teamId)),
          membership,
        ),
        updatedAt: nowIso(),
      });
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível trocar de time agora.',
      );
    }
  },

  async joinTeamWithInviteCode(inviteCode: string, userId: string) {
    try {
      const firestore = requireFirestore();
      const sessionUser = await fetchUserById(userId);
      const { user } = await ensureMembershipsForUser(sessionUser);

      const invite = await fetchTeamInviteByCode(inviteCode);
      if (!invite) {
        throw createRepositoryError(
          'Não encontramos um time com esse código.',
          'not-found',
        );
      }

      const existingMembership = await fetchTeamMemberByUserAndTeam(user.id, invite.teamId);
      if (existingMembership?.status === 'active') {
        await persistUserContext(user, existingMembership, new Map());
        const team = await fetchTeamById(invite.teamId);
        return {
          team,
          alreadyMember: true,
        };
      }

      const updatedAt = nowIso();
      const batch = writeBatch(firestore);

      const membership = buildTeamMemberDocument({
        id:
          existingMembership?.id ??
          doc(collection(firestore, FIRESTORE_COLLECTIONS.teamMembers)).id,
        userId: user.id,
        teamId: invite.teamId,
        playerId: existingMembership?.playerId ?? null,
        inviteCodeUsed: invite.code,
        roles: existingMembership?.roles.includes('admin')
          ? ['admin', 'player']
          : ['player'],
        canManageTeam: existingMembership?.canManageTeam ?? false,
        canManagePlayers: existingMembership?.canManagePlayers ?? false,
        createdAt: existingMembership?.createdAt ?? updatedAt,
        updatedAt,
        joinedAt: existingMembership?.joinedAt ?? updatedAt,
        status: 'active',
      });
      const updatedUser = normalizeUserDocument({
        ...user,
        appRole:
          user.appRole === 'owner'
            ? 'owner'
            : membership.roles.includes('admin') || membership.canManageTeam
              ? 'team_admin'
              : 'player',
        activeTeamId: invite.teamId,
        teamId: invite.teamId,
        playerId: membership.playerId ?? null,
        updatedAt,
      });

      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, membership.id), membership);
      applyFirestoreBatchMutation(batch, buildTeamMembershipIndexMutation(membership));
      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.users, user.id), updatedUser);
      await batch.commit();
      const team = await fetchTeamById(invite.teamId);

      return {
        team,
        alreadyMember: false,
      };
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível entrar no time agora.',
      );
    }
  },

  async createPlayer(input: CreatePlayerInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor } = await ensurePlayerManager(actorUserId, input.teamId);
      await assertJerseyAvailable(input.teamId, input.jerseyNumber);

      const teamPlayers = await fetchPlayersByTeamId(input.teamId);
      const explicitLinkedUser = input.linkedUserId
        ? await validateLinkedUserAssignment(input.linkedUserId, input.teamId)
        : null;
      const linkedEmail = validateLinkedEmailAssignment(
        teamPlayers,
        explicitLinkedUser?.email ?? input.linkedEmail,
      );
      const team = await fetchTeamById(input.teamId);
      const linkResult = await linkPlayerToUserIfEmailMatches({
        team,
        player: {
          id: '',
          linkedUserId: null,
          linkedEmail,
        },
        linkedUserId: input.linkedUserId ?? null,
        linkedEmail,
        preferredUser: explicitLinkedUser ?? actor,
      });

      const now = nowIso();
      const playerRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.players));
      const player: FirestorePlayerDocument = normalizePlayerDocument({
        id: playerRef.id,
        teamId: input.teamId,
        linkedUserId: linkResult.linkedUserId,
        linkedEmail: linkResult.linkedEmail,
        fullName: input.fullName.trim(),
        nickname: input.nickname.trim(),
        photoUrl: input.photoUrl ?? null,
        presentationVideoUrl: input.presentationVideoUrl ?? null,
        jerseyNumber: input.jerseyNumber,
        primaryPosition: input.primaryPosition,
        secondaryPositions: sanitizeSecondaryPositions(
          input.primaryPosition,
          input.secondaryPositions,
        ),
        dominantFoot: input.dominantFoot,
        status: input.status,
        bio: input.bio?.trim() ?? '',
        preferredPosition: input.preferredPosition ?? input.primaryPosition,
        introVideoUrl: input.introVideoUrl ?? null,
        celebrationVideoUrl: input.celebrationVideoUrl ?? null,
        allowSelfEditJerseyNumber: input.allowSelfEditJerseyNumber ?? false,
        manualStats: normalizeManualStats(input.manualStats),
        createdAt: now,
        updatedAt: now,
      });
      await setDoc(playerRef, player);

      if (linkResult.linkedUser) {
        await syncLinkedUserMembership({
          linkedUser: linkResult.linkedUser,
          team,
          playerId: player.id,
          updatedAt: now,
        });
      }

      await ensureOpenMatchAttendanceForPlayer(player, now);
      await syncPublicTeamProjection(team, now);

      return player;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível salvar o jogador agora.',
      );
    }
  },

  async updatePlayer(playerId: string, input: UpdatePlayerInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor, membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayer = await fetchPlayerByIdForTeam(activeTeamId, playerId);
      const currentTeam = await fetchTeamById(currentPlayer.teamId);
      const now = nowIso();
      const playerRef = doc(firestore, FIRESTORE_COLLECTIONS.players, playerId);
      const canManagePlayer = membership?.canManagePlayers === true;
      const canManageLifecycle = membership?.canManageTeam === true;

      if (canManagePlayer) {
        if (
          !canManageLifecycle &&
          touchesRestrictedPlayerAdminFields(currentPlayer, {
            status: input.status,
            linkedUserId: input.linkedUserId,
            linkedEmail: input.linkedEmail,
          })
        ) {
          throw createRepositoryError(
            'Apenas o administrador do time pode alterar o status ou o vinculo da conta do jogador.',
            'permission-denied',
          );
        }

        if (typeof input.jerseyNumber === 'number') {
          await assertJerseyAvailable(
            currentPlayer.teamId,
            input.jerseyNumber,
            currentPlayer.id,
          );
        }

        const teamPlayers = await fetchPlayersByTeamId(currentPlayer.teamId);
        const explicitLinkedUser =
          typeof input.linkedUserId === 'string'
            ? await validateLinkedUserAssignment(
                input.linkedUserId,
                currentPlayer.teamId,
                currentPlayer.id,
              )
            : null;
        const nextLinkedEmail = validateLinkedEmailAssignment(
          teamPlayers,
          explicitLinkedUser?.email ??
            (input.linkedEmail !== undefined
              ? input.linkedEmail
              : currentPlayer.linkedEmail),
          currentPlayer.id,
        );
        const linkResult = await linkPlayerToUserIfEmailMatches({
          team: currentTeam,
          player: currentPlayer,
          linkedUserId:
            input.linkedUserId !== undefined
              ? input.linkedUserId
              : currentPlayer.linkedUserId ?? null,
          linkedEmail:
            input.linkedEmail !== undefined
              ? nextLinkedEmail
              : currentPlayer.linkedEmail ?? nextLinkedEmail,
          currentPlayerId: currentPlayer.id,
          preferredUser: explicitLinkedUser ?? actor,
        });

        const updatedPlayer: FirestorePlayerDocument = normalizePlayerDocument({
          ...currentPlayer,
          fullName:
            typeof input.fullName === 'string'
              ? input.fullName.trim()
              : currentPlayer.fullName,
          nickname:
            typeof input.nickname === 'string'
              ? input.nickname.trim()
              : currentPlayer.nickname,
          photoUrl:
            input.photoUrl !== undefined
              ? input.photoUrl
              : currentPlayer.photoUrl ?? null,
          presentationVideoUrl:
            input.presentationVideoUrl !== undefined
              ? input.presentationVideoUrl
              : currentPlayer.presentationVideoUrl ?? null,
          jerseyNumber:
            typeof input.jerseyNumber === 'number'
              ? input.jerseyNumber
              : currentPlayer.jerseyNumber,
          primaryPosition: input.primaryPosition ?? currentPlayer.primaryPosition,
          secondaryPositions: input.secondaryPositions
            ? sanitizeSecondaryPositions(
                input.primaryPosition ?? currentPlayer.primaryPosition,
                input.secondaryPositions,
              )
            : currentPlayer.secondaryPositions,
          dominantFoot: input.dominantFoot ?? currentPlayer.dominantFoot,
          status: input.status ?? currentPlayer.status,
          bio:
            input.bio !== undefined
              ? input.bio?.trim() ?? ''
              : currentPlayer.bio ?? '',
          preferredPosition:
            input.preferredPosition !== undefined
              ? input.preferredPosition
              : currentPlayer.preferredPosition ?? null,
          introVideoUrl:
            input.introVideoUrl !== undefined
              ? input.introVideoUrl
              : currentPlayer.introVideoUrl ?? null,
          celebrationVideoUrl:
            input.celebrationVideoUrl !== undefined
              ? input.celebrationVideoUrl
              : currentPlayer.celebrationVideoUrl ?? null,
          allowSelfEditJerseyNumber:
            input.allowSelfEditJerseyNumber !== undefined
              ? input.allowSelfEditJerseyNumber
              : currentPlayer.allowSelfEditJerseyNumber ?? false,
          linkedUserId: linkResult.linkedUserId,
          linkedEmail: linkResult.linkedEmail,
          manualStats:
            input.manualStats !== undefined
              ? normalizeManualStats(input.manualStats)
              : currentPlayer.manualStats,
          updatedAt: now,
        });

        await setDoc(playerRef, updatedPlayer);

        if (
          currentPlayer.linkedUserId &&
          currentPlayer.linkedUserId !== updatedPlayer.linkedUserId
        ) {
          await clearLinkedUserMembershipPlayer({
            linkedUserId: currentPlayer.linkedUserId,
            team: currentTeam,
            playerId: currentPlayer.id,
            updatedAt: now,
          });
        }

        if (updatedPlayer.linkedUserId) {
          await syncLinkedUserMembership({
            linkedUser:
              linkResult.linkedUser ?? (await fetchUserById(updatedPlayer.linkedUserId)),
            team: currentTeam,
            playerId: updatedPlayer.id,
            updatedAt: now,
          });
        }

        await ensureOpenMatchAttendanceForPlayer(updatedPlayer, now);
        await syncPublicTeamProjection(currentTeam, now);

        return updatedPlayer;
      }

      await ensureSelfPlayerEdit(actorUserId, currentPlayer);
      allowedSelfUpdateFields(input);

      if (
        typeof input.jerseyNumber === 'number' &&
        !(currentPlayer.allowSelfEditJerseyNumber || !currentPlayer.jerseyNumber)
      ) {
        throw createRepositoryError(
          'O numero da camisa continua sob ajuste do administrador.',
          'permission-denied',
        );
      }

      const updatedPlayer: FirestorePlayerDocument = normalizePlayerDocument({
        ...currentPlayer,
        nickname:
          typeof input.nickname === 'string'
            ? input.nickname.trim()
            : currentPlayer.nickname,
        photoUrl:
          input.photoUrl !== undefined
            ? input.photoUrl
            : currentPlayer.photoUrl ?? null,
        presentationVideoUrl:
          input.presentationVideoUrl !== undefined
            ? input.presentationVideoUrl
            : currentPlayer.presentationVideoUrl ?? null,
        bio:
          input.bio !== undefined
            ? input.bio?.trim() ?? ''
            : currentPlayer.bio ?? '',
        jerseyNumber:
          typeof input.jerseyNumber === 'number'
            ? input.jerseyNumber
            : currentPlayer.jerseyNumber,
        secondaryPositions: input.secondaryPositions
          ? sanitizeSecondaryPositions(
              currentPlayer.primaryPosition,
              input.secondaryPositions,
            )
          : currentPlayer.secondaryPositions,
        dominantFoot: input.dominantFoot ?? currentPlayer.dominantFoot,
        preferredPosition:
          input.preferredPosition !== undefined
            ? input.preferredPosition
            : currentPlayer.preferredPosition ?? null,
        introVideoUrl:
          input.introVideoUrl !== undefined
            ? input.introVideoUrl
            : currentPlayer.introVideoUrl ?? null,
        celebrationVideoUrl:
          input.celebrationVideoUrl !== undefined
            ? input.celebrationVideoUrl
            : currentPlayer.celebrationVideoUrl ?? null,
        updatedAt: now,
      });

      await setDoc(playerRef, updatedPlayer);
      await syncPublicTeamProjection(currentTeam, now);
      return updatedPlayer;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível atualizar o jogador agora.',
      );
    }
  },

  async unlinkPlayerAccount(playerId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayer = await fetchPlayerByIdForTeam(activeTeamId, playerId);
      const currentTeam = await fetchTeamById(currentPlayer.teamId);

      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode desvincular a conta do jogador.',
          'permission-denied',
        );
      }

      if (!currentPlayer.linkedUserId && !currentPlayer.linkedEmail) {
        return currentPlayer;
      }

      const updatedAt = nowIso();
      const updatedPlayer = normalizePlayerDocument({
        ...buildUnlinkedPlayerState(currentPlayer, updatedAt),
      });

      await setDoc(
        doc(firestore, FIRESTORE_COLLECTIONS.players, currentPlayer.id),
        updatedPlayer,
      );

      if (currentPlayer.linkedUserId) {
        await clearLinkedUserMembershipPlayer({
          linkedUserId: currentPlayer.linkedUserId,
          team: currentTeam,
          playerId: currentPlayer.id,
          updatedAt,
        });
      }

      await syncPublicTeamProjection(currentTeam, updatedAt);
      return updatedPlayer;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível desvincular a conta do jogador agora.',
      );
    }
  },

  async removePlayer(playerId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayer = await fetchPlayerByIdForTeam(activeTeamId, playerId);
      const currentTeam = await fetchTeamById(currentPlayer.teamId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode inativar um jogador.',
          'permission-denied',
        );
      }

      if (currentPlayer.deletedAt || currentPlayer.status === 'inactive') {
        throw createRepositoryError(
          'Esse jogador já está fora do elenco ativo.',
          'failed-precondition',
        );
      }

      const updatedAt = nowIso();
      const futureMatches = (await fetchMatchesByTeamId(currentTeam.id)).filter(
        (match) => match.status !== 'finished' && match.status !== 'canceled',
      );
      const futureMatchIds = new Set(futureMatches.map((match) => match.id));
      const futureAttendance = (await fetchAttendanceByTeamId(currentTeam.id)).filter(
        (item) => item.playerId === currentPlayer.id && futureMatchIds.has(item.matchId),
      );
      const futureLineups = (await fetchLineupsByTeamId(currentTeam.id)).filter(
        (lineup) =>
          futureMatchIds.has(lineup.matchId) &&
          (lineup.benchPlayerIds.includes(currentPlayer.id) ||
            lineup.starters.some((starter) => starter.playerId === currentPlayer.id)),
      );

      const updatedPlayer = normalizePlayerDocument({
        ...buildInactivatedPlayerState(currentPlayer, updatedAt),
      });

      const batch = writeBatch(firestore);
      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.players, currentPlayer.id), updatedPlayer);

      for (const attendanceRecord of futureAttendance) {
        batch.delete(doc(firestore, FIRESTORE_COLLECTIONS.attendance, attendanceRecord.id));
      }

      for (const lineup of futureLineups) {
        const updatedLineup = normalizeLineupDocument({
          ...lineup,
          starters: lineup.starters.filter(
            (starter) => starter.playerId !== currentPlayer.id,
          ),
          benchPlayerIds: lineup.benchPlayerIds.filter(
            (benchPlayerId) => benchPlayerId !== currentPlayer.id,
          ),
          updatedAt,
        });

        batch.set(doc(firestore, FIRESTORE_COLLECTIONS.lineups, lineup.id), updatedLineup);
      }

      let linkedUserContext:
        | {
            linkedUser: User;
            nextMembership: TeamMember | null;
            teamsById: Map<string, Team>;
          }
        | null = null;

      if (currentPlayer.linkedUserId) {
        const linkedUser = await fetchUserById(currentPlayer.linkedUserId);
        const existingMembership = await fetchTeamMemberByUserAndTeam(
          linkedUser.id,
          currentTeam.id,
        );

        if (existingMembership) {
          const keepAdminAccess = existingMembership.roles.includes('admin');
          const updatedMembership = buildTeamMemberDocument({
            ...existingMembership,
            playerId: null,
            roles: keepAdminAccess
              ? existingMembership.roles.filter((role) => role !== 'player')
              : [],
            canManageTeam: keepAdminAccess && existingMembership.canManageTeam,
            canManagePlayers: keepAdminAccess && existingMembership.canManagePlayers,
            status: keepAdminAccess ? 'active' : 'inactive',
            updatedAt,
          });

          batch.set(
            doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, updatedMembership.id),
            updatedMembership,
          );
          applyFirestoreBatchMutation(batch, buildTeamMembershipIndexMutation(updatedMembership));

          const nextMemberships = (await fetchTeamMembersByUserId(linkedUser.id)).map(
            (membership) =>
              membership.id === updatedMembership.id ? updatedMembership : membership,
          );
          const nextActiveMembership =
            nextMemberships.find(
              (membership) =>
                membership.status === 'active' &&
                membership.teamId === linkedUser.activeTeamId,
            ) ??
            nextMemberships.find((membership) => membership.status === 'active') ??
            null;
          const relatedTeams = await fetchTeamsByIds(
            nextMemberships
              .filter((membership) => membership.status === 'active')
              .map((membership) => membership.teamId),
          );

          linkedUserContext = {
            linkedUser,
            nextMembership: nextActiveMembership,
            teamsById: new Map(relatedTeams.map((team) => [team.id, team])),
          };
        }
      }

      await batch.commit();

      if (linkedUserContext) {
        await persistUserContext(
          linkedUserContext.linkedUser,
          linkedUserContext.nextMembership,
          linkedUserContext.teamsById,
        );
      }

      await syncPublicTeamProjection(currentTeam, updatedAt);
      return updatedPlayer;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível inativar o jogador agora.',
      );
    }
  },

  async reactivatePlayer(playerId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayer = await fetchPlayerByIdForTeam(activeTeamId, playerId);
      const currentTeam = await fetchTeamById(currentPlayer.teamId);

      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode reativar um jogador.',
          'permission-denied',
        );
      }

      if (currentPlayer.status !== 'inactive' && !currentPlayer.deletedAt) {
        throw createRepositoryError(
          'Esse jogador ja esta ativo no elenco.',
          'failed-precondition',
        );
      }

      const teamPlayers = await fetchPlayersByTeamId(currentPlayer.teamId);
      const explicitLinkedUser = currentPlayer.linkedUserId
        ? await validateLinkedUserAssignment(
            currentPlayer.linkedUserId,
            currentPlayer.teamId,
            currentPlayer.id,
          )
        : null;
      const nextLinkedEmail = validateLinkedEmailAssignment(
        teamPlayers,
        explicitLinkedUser?.email ?? currentPlayer.linkedEmail,
        currentPlayer.id,
      );
      const linkResult = await linkPlayerToUserIfEmailMatches({
        team: currentTeam,
        player: currentPlayer,
        linkedUserId: currentPlayer.linkedUserId ?? null,
        linkedEmail: nextLinkedEmail,
        currentPlayerId: currentPlayer.id,
        preferredUser: explicitLinkedUser,
      });
      const now = nowIso();
      const updatedPlayer = normalizePlayerDocument({
        ...buildReactivatedPlayerState(
          {
            ...currentPlayer,
            linkedUserId: linkResult.linkedUserId,
            linkedEmail: linkResult.linkedEmail,
          },
          now,
        ),
        linkedUserId: linkResult.linkedUserId,
        linkedEmail: linkResult.linkedEmail,
      });

      await setDoc(
        doc(firestore, FIRESTORE_COLLECTIONS.players, currentPlayer.id),
        updatedPlayer,
      );

      if (
        currentPlayer.linkedUserId &&
        currentPlayer.linkedUserId !== updatedPlayer.linkedUserId
      ) {
        await clearLinkedUserMembershipPlayer({
          linkedUserId: currentPlayer.linkedUserId,
          team: currentTeam,
          playerId: currentPlayer.id,
          updatedAt: now,
        });
      }

      if (updatedPlayer.linkedUserId) {
        await syncLinkedUserMembership({
          linkedUser:
            linkResult.linkedUser ?? (await fetchUserById(updatedPlayer.linkedUserId)),
          team: currentTeam,
          playerId: updatedPlayer.id,
          updatedAt: now,
        });
      }

      await ensureOpenMatchAttendanceForPlayer(updatedPlayer, now);
      await syncPublicTeamProjection(currentTeam, now);

      return updatedPlayer;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível reativar o jogador agora.',
      );
    }
  },

  async createMatch(input: CreateMatchInput, creatorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor } = await ensureTeamAdmin(creatorUserId, input.teamId);
      const teamPlayers = (await fetchPlayersByTeamId(input.teamId)).filter(isActivePlayer);
      const createdAt = nowIso();
      const matchRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.matches));
      const match = normalizeMatchDocument({
        id: matchRef.id,
        teamId: input.teamId,
        seasonId: input.seasonId ?? null,
        date: input.date,
        time: input.time,
        venue: input.venue.trim(),
        locationUrl: input.locationUrl?.trim() || null,
        opponentName: input.opponentName.trim(),
        opponentLogoUrl: input.opponentLogoUrl ?? null,
        opponentTeamId: input.opponentTeamId ?? null,
        opponentTeamName: input.opponentTeamName ?? null,
        opponentTeamLogoUrl: input.opponentTeamLogoUrl ?? null,
        opponentSource: input.opponentSource ?? null,
        linePlayersCount: input.linePlayersCount,
        matchType: input.matchType,
        notes: input.notes?.trim() ?? '',
        status: 'scheduled',
        createdBy: actor.id,
        scoreboard: null,
        finishedAt: null,
        mvpWinnerPlayerIds: [],
        mvpTotalVotes: 0,
        createdAt,
        updatedAt: createdAt,
      });

      const batch = writeBatch(firestore);
      batch.set(matchRef, match);
      batch.set(
        doc(
          firestore,
          FIRESTORE_COLLECTIONS.notifications,
          buildNotificationId('match-created', match.id),
        ),
        createMatchCreatedNotification({
          id: buildNotificationId('match-created', match.id),
          teamId: match.teamId,
          match,
          actorUserId: actor.id,
          updatedAt: createdAt,
        }),
      );

      for (const player of teamPlayers) {
        const attendanceId = buildStableDocumentId(match.id, player.id);
        const attendance = normalizeAttendanceDocument({
          id: attendanceId,
          teamId: input.teamId,
          matchId: match.id,
          playerId: player.id,
          userId: player.linkedUserId ?? null,
          status: 'pending',
          respondedAt: null,
          createdAt,
          updatedAt: createdAt,
        });
        batch.set(
          doc(firestore, FIRESTORE_COLLECTIONS.attendance, attendanceId),
          attendance,
        );
      }

      await batch.commit();
      return match;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível criar a partida agora.',
      );
    }
  },

  async updateMatch(matchId: string, input: UpdateMatchInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode fazer essa acao.',
          'permission-denied',
        );
      }

      const currentMatch = await fetchMatchByIdForTeam(activeTeamId, matchId);
      const updatedAt = nowIso();
      const nextStatus = input.status ?? currentMatch.status;
      const updatedMatch = normalizeMatchDocument({
        ...currentMatch,
        seasonId: input.seasonId ?? currentMatch.seasonId ?? null,
        date: input.date,
        time: input.time,
        venue: input.venue.trim(),
        locationUrl:
          input.locationUrl !== undefined
            ? input.locationUrl?.trim() || null
            : currentMatch.locationUrl ?? null,
        opponentName: input.opponentName.trim(),
        opponentLogoUrl:
          input.opponentLogoUrl !== undefined
            ? input.opponentLogoUrl
            : currentMatch.opponentLogoUrl ?? null,
        opponentTeamId:
          input.opponentTeamId !== undefined
            ? input.opponentTeamId
            : currentMatch.opponentTeamId ?? null,
        opponentTeamName:
          input.opponentTeamName !== undefined
            ? input.opponentTeamName
            : currentMatch.opponentTeamName ?? null,
        opponentTeamLogoUrl:
          input.opponentTeamLogoUrl !== undefined
            ? input.opponentTeamLogoUrl
            : currentMatch.opponentTeamLogoUrl ?? null,
        opponentSource:
          input.opponentSource !== undefined
            ? input.opponentSource
            : currentMatch.opponentSource ?? null,
        linePlayersCount: input.linePlayersCount,
        matchType: input.matchType,
        notes: input.notes?.trim() ?? '',
        fieldCost:
          input.fieldCost !== undefined
            ? input.fieldCost
            : currentMatch.fieldCost ?? null,
        fieldPayment:
          input.fieldCost === null ? null : currentMatch.fieldPayment ?? null,
        status: nextStatus,
        scoreboard: nextStatus === 'canceled' ? null : currentMatch.scoreboard ?? null,
        finishedAt:
          nextStatus === 'canceled'
            ? null
            : currentMatch.finishedAt ?? null,
        updatedAt,
      });
      const notificationId = buildNotificationId('match-updated', currentMatch.id);
      const existingNotification = await fetchNotificationByIdForTeam(
        activeTeamId,
        notificationId,
      );
      const batch = writeBatch(firestore);
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.matches, currentMatch.id),
        updatedMatch,
      );
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.notifications, notificationId),
        createMatchUpdatedNotification({
          id: notificationId,
          teamId: currentMatch.teamId,
          match: updatedMatch,
          actorUserId: actorUserId,
          createdAt: existingNotification?.createdAt,
          updatedAt,
        }),
      );
      await batch.commit();
      await syncPublicTeamProjection(await fetchTeamById(activeTeamId), updatedAt);
      return updatedMatch;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível salvar a partida agora.',
      );
    }
  },

  async updateMatchFieldPayment(
    matchId: string,
    input: UpdateMatchFieldPaymentInput,
    actorUserId: string,
  ) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode fazer essa acao.',
          'permission-denied',
        );
      }

      const currentMatch = await fetchMatchByIdForTeam(activeTeamId, matchId);

      if (!currentMatch.fieldCost) {
        throw createRepositoryError(
          'Informe o valor do campo antes de controlar pagamentos.',
          'failed-precondition',
        );
      }

      const attendance = await fetchAttendanceByMatchIdForTeam(activeTeamId, currentMatch.id);
      const confirmedPlayerIds = attendance
        .filter((item) => item.status === 'confirmed')
        .map((item) => item.playerId);
      const updatedAt = nowIso();
      const updatedMatch = normalizeMatchDocument({
        ...currentMatch,
        fieldPayment: input.fieldPayment
          ? buildMatchFieldPayment({
              values: input.fieldPayment,
              fieldCost: currentMatch.fieldCost,
              confirmedPlayerIds,
              updatedAt,
              updatedByUserId: actorUserId,
            })
          : null,
        updatedAt,
      });

      await setDoc(
        doc(firestore, FIRESTORE_COLLECTIONS.matches, currentMatch.id),
        updatedMatch,
      );
      return updatedMatch;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível salvar o controle do campo agora.',
      );
    }
  },

  async updateAttendance(input: UpdateAttendanceInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor, membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayerId = membership.roles.includes('player')
        ? await ensureCurrentUserPlayerForActiveTeam(actorUserId)
        : null;
      const match = await fetchMatchByIdForTeam(activeTeamId, input.matchId);

      if (match.status === 'finished' || match.status === 'canceled') {
        throw createRepositoryError(
          'A presença desta partida não aceita mais alterações.',
          'failed-precondition',
        );
      }

      const player = await ensurePlayerBelongsToTeam(input.playerId, match.teamId);
      const canManageAttendance = membership.canManageTeam === true;
      const isOwnAttendance = currentPlayerId === player.id;

      if (!canManageAttendance && !isOwnAttendance) {
        throw createRepositoryError(
          'Você só pode responder à sua própria presença.',
          'permission-denied',
        );
      }

      const attendanceItems = await fetchAttendanceByMatchIdForTeam(activeTeamId, match.id);
      const existingRecord =
        attendanceItems.find((item) => item.playerId === player.id) ?? null;
      const attendanceId = buildStableDocumentId(match.id, player.id);
      const recordRef = existingRecord
        ? doc(firestore, FIRESTORE_COLLECTIONS.attendance, existingRecord.id)
        : doc(firestore, FIRESTORE_COLLECTIONS.attendance, attendanceId);
      const updatedAt = nowIso();
      const attendance = normalizeAttendanceDocument({
        id: existingRecord?.id ?? attendanceId,
        teamId: match.teamId,
        matchId: match.id,
        playerId: player.id,
        userId:
          isOwnAttendance
            ? actor.id
            : player.linkedUserId ?? existingRecord?.userId ?? null,
        status: input.status,
        respondedAt: updatedAt,
        createdAt: existingRecord?.createdAt ?? updatedAt,
        updatedAt,
      });
      const batch = writeBatch(firestore);
      batch.set(recordRef, attendance);

      const notificationId = buildNotificationId('attendance-confirmed', match.id, player.id);
      if (input.status === 'confirmed' || input.status === 'absent') {
        const existingNotification = await fetchNotificationByIdForTeam(
          activeTeamId,
          notificationId,
        );
        batch.set(
          doc(firestore, FIRESTORE_COLLECTIONS.notifications, notificationId),
          createAttendanceNotification({
            id: notificationId,
            teamId: match.teamId,
            match,
            player,
            status: input.status,
            actorUserId: actor.id,
            createdAt: existingNotification?.createdAt,
            updatedAt,
          }),
        );
      } else {
        batch.delete(doc(firestore, FIRESTORE_COLLECTIONS.notifications, notificationId));
      }

      await batch.commit();
      return attendance;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível atualizar a presença agora.',
      );
    }
  },

  async saveLineup(input: SaveLineupInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode fazer essa acao.',
          'permission-denied',
        );
      }

      const match = await fetchMatchByIdForTeam(activeTeamId, input.matchId);

      if (match.status === 'finished' || match.status === 'canceled') {
        throw createRepositoryError(
          'A escalação só pode ser salva antes do encerramento da partida.',
          'failed-precondition',
        );
      }

      validateLineupSlots(input);

      const attendance = await fetchAttendanceByMatchIdForTeam(activeTeamId, match.id);
      const confirmedPlayerIds = new Set(
        attendance
          .filter((item) => item.status === 'confirmed')
          .map((item) => item.playerId),
      );

      if (confirmedPlayerIds.size === 0) {
        throw createRepositoryError(
          'Confirme a presença do elenco antes de salvar a escalação.',
          'failed-precondition',
        );
      }

      for (const starter of input.starters) {
        await ensurePlayerBelongsToTeam(starter.playerId, match.teamId);
        if (!confirmedPlayerIds.has(starter.playerId)) {
          throw createRepositoryError(
            'A escalação aceita apenas jogadores confirmados.',
            'failed-precondition',
          );
        }
      }

      for (const playerId of input.benchPlayerIds) {
        await ensurePlayerBelongsToTeam(playerId, match.teamId);
        if (!confirmedPlayerIds.has(playerId)) {
          throw createRepositoryError(
            'A escalação aceita apenas jogadores confirmados.',
            'failed-precondition',
          );
        }
      }

      const existingLineup = await fetchLineupByMatchIdForTeam(activeTeamId, match.id);
      const lineupRef = existingLineup
        ? doc(firestore, FIRESTORE_COLLECTIONS.lineups, existingLineup.id)
        : doc(collection(firestore, FIRESTORE_COLLECTIONS.lineups));
      const updatedAt = nowIso();
      const lineup = normalizeLineupDocument({
        id: lineupRef.id,
        teamId: match.teamId,
        matchId: match.id,
        formationKey: input.formationKey,
        starters: input.starters,
        benchPlayerIds: input.benchPlayerIds,
        createdAt: existingLineup?.createdAt ?? updatedAt,
        updatedAt,
      });
      const notificationId = buildNotificationId('lineup-published', match.id);
      const existingNotification = await fetchNotificationByIdForTeam(
        activeTeamId,
        notificationId,
      );
      const batch = writeBatch(firestore);
      batch.set(lineupRef, lineup);
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.notifications, notificationId),
        createLineupPublishedNotification({
          id: notificationId,
          teamId: match.teamId,
          match,
          actorUserId: actorUserId,
          createdAt: existingNotification?.createdAt,
          updatedAt,
        }),
      );
      await batch.commit();
      return lineup;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível salvar a escalação agora.',
      );
    }
  },

  async finishMatch(input: FinishMatchInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode fazer essa acao.',
          'permission-denied',
        );
      }

      const currentMatch = await fetchMatchByIdForTeam(activeTeamId, input.matchId);

      if (currentMatch.status === 'canceled') {
        throw createRepositoryError(
          'Uma partida cancelada não pode ser encerrada.',
          'failed-precondition',
        );
      }

      const ownGoalsForTeam = input.ownGoalsForTeam ?? 0;

      if (input.teamScore < 0 || input.opponentScore < 0 || ownGoalsForTeam < 0) {
        throw createRepositoryError(
          'O placar não pode ter números negativos.',
          'failed-precondition',
        );
      }

      const updatedAt = nowIso();
      const attendance = await fetchAttendanceByMatchIdForTeam(activeTeamId, currentMatch.id);
      const confirmedPlayerIds = new Set(
        attendance
          .filter((item) => item.status === 'confirmed')
          .map((item) => item.playerId),
      );

      if (confirmedPlayerIds.size === 0) {
        throw createRepositoryError(
          'Confirme a presença do elenco antes de fechar a partida.',
          'failed-precondition',
        );
      }

      for (const stat of input.playerStats) {
        if (!confirmedPlayerIds.has(stat.playerId)) {
          throw createRepositoryError(
            'Somente jogadores confirmados podem receber gols e assistencias.',
            'failed-precondition',
          );
        }

        if (stat.goals < 0 || stat.assists < 0) {
          throw createRepositoryError(
            'Gols e assistências não podem ser negativos.',
            'failed-precondition',
          );
        }
      }

      const existingLineup = await fetchLineupByMatchIdForTeam(activeTeamId, currentMatch.id);
      const starterIds = new Set(
        existingLineup?.starters.map((starter) => starter.playerId) ?? [],
      );
      const submittedStats = input.playerStats.reduce<
        Record<string, { goals: number; assists: number }>
      >((acc, stat) => {
        acc[stat.playerId] = {
          goals: stat.goals,
          assists: stat.assists,
        };
        return acc;
      }, {});
      const existingMatchStats = await fetchMatchStatsByMatchIdForTeam(
        activeTeamId,
        currentMatch.id,
      );
      const nextMatchStatIds = new Set(
        [...confirmedPlayerIds].map((playerId) =>
          buildStableDocumentId(currentMatch.id, playerId),
        ),
      );
      const nextFieldCost = input.fieldCost
        ? buildMatchFieldCost({
            values: input.fieldCost,
            updatedAt,
            updatedByUserId: actorUserId,
          })
        : null;

      if (
        nextFieldCost &&
        currentMatch.fieldPayment &&
        getMatchFieldPaymentSummary(nextFieldCost, currentMatch.fieldPayment).totalPaidCount >
          nextFieldCost.splitCount
      ) {
        throw createRepositoryError(
          'A nova divisão do campo não comporta a quantidade de pagantes já marcada.',
          'failed-precondition',
        );
      }

      const updatedMatch = normalizeMatchDocument({
        ...currentMatch,
        status: 'finished',
        scoreboard: {
          team: input.teamScore,
          opponent: input.opponentScore,
          ownGoalsForTeam,
          result: calculateMatchResult(input.teamScore, input.opponentScore),
        },
        fieldCost: nextFieldCost,
        fieldPayment: nextFieldCost ? currentMatch.fieldPayment ?? null : null,
        finishedAt: currentMatch.finishedAt ?? updatedAt,
        updatedAt,
      });
      const finishedNotificationId = buildNotificationId('match-finished', currentMatch.id);
      const votingNotificationId = buildNotificationId('mvp-voting-opened', currentMatch.id);
      const ratingsNotificationId = buildNotificationId('ratings-opened', currentMatch.id);
      const [
        existingFinishedNotification,
        existingVotingNotification,
        existingRatingsNotification,
      ] = await Promise.all([
        fetchNotificationByIdForTeam(activeTeamId, finishedNotificationId),
        fetchNotificationByIdForTeam(activeTeamId, votingNotificationId),
        fetchNotificationByIdForTeam(activeTeamId, ratingsNotificationId),
      ]);

      const batch = writeBatch(firestore);
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.matches, currentMatch.id),
        updatedMatch,
      );
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.notifications, finishedNotificationId),
        createMatchFinishedNotification({
          id: finishedNotificationId,
          teamId: currentMatch.teamId,
          match: updatedMatch,
          actorUserId: actorUserId,
          createdAt: existingFinishedNotification?.createdAt,
          updatedAt,
        }),
      );
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.notifications, votingNotificationId),
        createMvpVotingOpenedNotification({
          id: votingNotificationId,
          teamId: currentMatch.teamId,
          match: updatedMatch,
          actorUserId: actorUserId,
          createdAt: existingVotingNotification?.createdAt,
          updatedAt,
        }),
      );
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.notifications, ratingsNotificationId),
        createRatingsOpenedNotification({
          id: ratingsNotificationId,
          teamId: currentMatch.teamId,
          match: updatedMatch,
          actorUserId: actorUserId,
          createdAt: existingRatingsNotification?.createdAt,
          updatedAt,
        }),
      );

      for (const existingMatchStat of existingMatchStats) {
        if (!nextMatchStatIds.has(existingMatchStat.id)) {
          batch.delete(
            doc(firestore, FIRESTORE_COLLECTIONS.matchStats, existingMatchStat.id),
          );
        }
      }

      for (const playerId of confirmedPlayerIds) {
        const matchStatId = buildStableDocumentId(currentMatch.id, playerId);
        const existingMatchStat =
          existingMatchStats.find((item) => item.id === matchStatId) ?? null;
        const matchStat = normalizeMatchStatDocument({
          id: matchStatId,
          teamId: currentMatch.teamId,
          matchId: currentMatch.id,
          playerId,
          played: true,
          started: starterIds.has(playerId),
          goals: submittedStats[playerId]?.goals ?? 0,
          assists: submittedStats[playerId]?.assists ?? 0,
          yellowCards: 0,
          redCards: 0,
          notes: '',
          createdAt: existingMatchStat?.createdAt ?? updatedAt,
          updatedAt,
        });

        batch.set(
          doc(firestore, FIRESTORE_COLLECTIONS.matchStats, matchStatId),
          matchStat,
        );
      }

      await batch.commit();
      await syncPublicTeamProjection(await fetchTeamById(activeTeamId), updatedAt);
      return updatedMatch;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível encerrar a partida agora.',
      );
    }
  },

  async registerFinishedMatch(input: RegisterFinishedMatchInput, actorUserId: string) {
    try {
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode fazer essa acao.',
          'permission-denied',
        );
      }

      const [team, teamPlayers] = await Promise.all([
        fetchTeamById(activeTeamId),
        fetchPlayersByTeamId(activeTeamId),
      ]);

      return await createFinishedMatchRecord({
        actorUserId,
        team,
        values: input,
        teamPlayers,
      });
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível registrar o jogo antigo agora.',
      );
    }
  },

  async previewLegacyMatchImport(
    payload: ImportedMatchPayloadItem[],
    actorUserId: string,
  ): Promise<LegacyMatchImportPreview> {
    try {
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode fazer essa acao.',
          'permission-denied',
        );
      }

      const [teamPlayers, matches] = await Promise.all([
        fetchPlayersByTeamId(activeTeamId),
        fetchMatchesByTeamId(activeTeamId),
      ]);

      return buildLegacyMatchImportPreview({
        payload,
        teamPlayers,
        existingMatches: matches,
      });
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível gerar a prévia da importação agora.',
      );
    }
  },

  async importLegacyMatches(
    payload: ImportedMatchPayloadItem[],
    actorUserId: string,
  ): Promise<ImportLegacyMatchesResult> {
    try {
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode fazer essa acao.',
          'permission-denied',
        );
      }

      const [team, teamPlayers, existingMatches] = await Promise.all([
        fetchTeamById(activeTeamId),
        fetchPlayersByTeamId(activeTeamId),
        fetchMatchesByTeamId(activeTeamId),
      ]);
      const preview = buildLegacyMatchImportPreview({
        payload,
        teamPlayers,
        existingMatches,
      });
      const createdMatchIds: string[] = [];
      let skippedDuplicates = 0;
      let invalidMatches = 0;

      for (const item of preview.items) {
        if (item.status === 'duplicate') {
          skippedDuplicates += 1;
          continue;
        }

        if (item.status !== 'ready') {
          invalidMatches += 1;
          continue;
        }

        const source = payload[item.sourceIndex];
        const players = item.players.flatMap<RegisterFinishedMatchPlayerInput>((player) => {
          if (player.status !== 'matched' || !player.matchedPlayerId) {
            return [];
          }

          return [{
            playerId: player.matchedPlayerId,
            played: player.played,
            started: player.started,
            goals: player.goals,
            assists: player.assists,
          }];
        });

        const match = await createFinishedMatchRecord({
          actorUserId,
          team,
          teamPlayers,
          values: {
            seasonId: team.activeSeasonId ?? null,
            date: source.date,
            time: source.time ?? '',
            venue: source.venue ?? null,
            locationUrl: source.locationUrl ?? null,
            opponentName: source.opponentName,
            opponentLogoUrl: source.opponentLogoUrl ?? null,
            linePlayersCount: source.linePlayersCount ?? null,
            matchType: source.matchType,
            notes: source.notes ?? null,
            teamScore: source.teamScore,
            opponentScore: source.opponentScore,
            players,
          },
        });
        createdMatchIds.push(match.id);
      }

      return {
        createdMatches: createdMatchIds.length,
        skippedDuplicates,
        invalidMatches,
        createdMatchIds,
      };
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível importar os jogos agora.',
      );
    }
  },

  async createMatchDiaryEntry(
    input: CreateMatchDiaryEntryInput,
    actorUserId: string,
  ) {
    try {
      const firestore = requireFirestore();
      const { actor, membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode publicar uma resenha.',
          'permission-denied',
        );
      }

      const match = await fetchMatchByIdForTeam(activeTeamId, input.matchId);
      const validated = validateDiaryFields({
        title: input.title,
        content: input.content,
      });
      const mentionedPlayerIds = await sanitizeMentionedPlayerIds(
        activeTeamId,
        input.mentionedPlayerIds,
      );
      const updatedAt = nowIso();
      const entryRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.matchDiaryEntries));
      const entry = normalizeMatchDiaryEntryDocument({
        id: entryRef.id,
        teamId: activeTeamId,
        matchId: match.id,
        authorUserId: actor.id,
        authorName: actor.displayName,
        title: validated.title,
        content: validated.content,
        mentionedPlayerIds,
        visibility: 'team',
        pinned: input.pinned ?? false,
        mood: input.mood ?? null,
        emoji: resolveDiaryEmoji(input.mood, input.emoji),
        createdAt: updatedAt,
        updatedAt,
      });

      const batch = writeBatch(firestore);
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.matchDiaryEntries, entry.id),
        entry,
      );

      if (input.notifyTeam) {
        const [teamMembers, existingNotifications] = await Promise.all([
          fetchTeamMembersByTeamId(activeTeamId),
          fetchAllNotificationsByTeamId(activeTeamId),
        ]);
        const notificationDocuments = buildDiaryNotificationDocuments({
          entry,
          match,
          actorUserId: actor.id,
          teamMembers,
          existingNotifications,
        });

        for (const notification of notificationDocuments) {
          batch.set(
            doc(firestore, FIRESTORE_COLLECTIONS.notifications, notification.id),
            notification,
          );
        }
      }

      await batch.commit();
      return entry;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível publicar a resenha agora.',
      );
    }
  },

  async updateMatchDiaryEntry(
    entryId: string,
    input: UpdateMatchDiaryEntryInput,
    actorUserId: string,
  ) {
    try {
      const firestore = requireFirestore();
      const { actor, membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode editar a resenha.',
          'permission-denied',
        );
      }

      const existingEntry = await fetchMatchDiaryEntryByIdForTeam(activeTeamId, entryId);
      if (!existingEntry) {
        throw createRepositoryError('Resenha da partida não encontrada.', 'not-found');
      }

      const match = await fetchMatchByIdForTeam(activeTeamId, existingEntry.matchId);
      const nextTitle = input.title !== undefined ? input.title : existingEntry.title;
      const nextContent = input.content !== undefined ? input.content : existingEntry.content;
      const validated = validateDiaryFields({
        title: nextTitle,
        content: nextContent,
      });
      const mentionedPlayerIds =
        input.mentionedPlayerIds !== undefined
          ? await sanitizeMentionedPlayerIds(activeTeamId, input.mentionedPlayerIds)
          : existingEntry.mentionedPlayerIds;
      const updatedAt = nowIso();
      const updatedEntry = normalizeMatchDiaryEntryDocument({
        ...existingEntry,
        title: normalizeDiaryTitle(validated.title),
        content: validated.content,
        mentionedPlayerIds,
        pinned: input.pinned ?? existingEntry.pinned ?? false,
        mood: input.mood !== undefined ? input.mood : existingEntry.mood ?? null,
        emoji:
          input.emoji !== undefined || input.mood !== undefined
            ? resolveDiaryEmoji(
                input.mood !== undefined ? input.mood : existingEntry.mood ?? null,
                input.emoji ?? existingEntry.emoji,
              )
            : existingEntry.emoji ?? null,
        updatedAt,
      });

      const batch = writeBatch(firestore);
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.matchDiaryEntries, updatedEntry.id),
        updatedEntry,
      );

      if (input.notifyTeam) {
        const [teamMembers, existingNotifications] = await Promise.all([
          fetchTeamMembersByTeamId(activeTeamId),
          fetchAllNotificationsByTeamId(activeTeamId),
        ]);
        const existingDiaryNotifications = existingNotifications.filter(
          (notification) =>
            notification.type === 'match-diary-published' &&
            notification.entryId === updatedEntry.id,
        );
        const nextNotificationDocuments = buildDiaryNotificationDocuments({
          entry: updatedEntry,
          match,
          actorUserId: actor.id,
          teamMembers,
          existingNotifications,
        });
        const nextNotificationIds = new Set(
          nextNotificationDocuments.map((notification) => notification.id),
        );

        for (const notification of existingDiaryNotifications) {
          if (!nextNotificationIds.has(notification.id)) {
            batch.delete(
              doc(firestore, FIRESTORE_COLLECTIONS.notifications, notification.id),
            );
          }
        }

        for (const notification of nextNotificationDocuments) {
          batch.set(
            doc(firestore, FIRESTORE_COLLECTIONS.notifications, notification.id),
            notification,
          );
        }
      }

      await batch.commit();
      return updatedEntry;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível atualizar a resenha agora.',
      );
    }
  },

  async deleteMatchDiaryEntry(entryId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (!membership.canManageTeam) {
        throw createRepositoryError(
          'Apenas o administrador do time pode excluir a resenha.',
          'permission-denied',
        );
      }

      const entry = await fetchMatchDiaryEntryByIdForTeam(activeTeamId, entryId);
      if (!entry) {
        throw createRepositoryError('Resenha da partida não encontrada.', 'not-found');
      }

      const notifications = await fetchAllNotificationsByTeamId(activeTeamId);
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, FIRESTORE_COLLECTIONS.matchDiaryEntries, entry.id));

      for (const notification of notifications.filter(
        (item) => item.type === 'match-diary-published' && item.entryId === entry.id,
      )) {
        batch.delete(doc(firestore, FIRESTORE_COLLECTIONS.notifications, notification.id));
      }

      await batch.commit();
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível excluir a resenha agora.',
      );
    }
  },

  async fetchMatchDiaryEntriesByMatchId(matchId: string, actorUserId: string) {
    try {
      const { activeTeamId } = await ensureActiveTeamContext(actorUserId);
      await fetchMatchByIdForTeam(activeTeamId, matchId);
      return await fetchMatchDiaryEntriesByMatchIdForTeam(activeTeamId, matchId);
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível carregar as resenhas desta partida.',
      );
    }
  },

  async listMatchDiaryEntriesForTeam(teamId: string, actorUserId: string, limit?: number) {
    try {
      const { activeTeamId } = await ensureActiveTeamContext(actorUserId);
      if (activeTeamId !== teamId) {
        throw createRepositoryError(
          'Troque para o time atual antes de continuar.',
          'permission-denied',
        );
      }

      const entries = await fetchMatchDiaryEntriesByTeamId(teamId);
      return limit != null ? entries.slice(0, limit) : entries;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível carregar o diário do time agora.',
      );
    }
  },

  async submitMvpVote(input: SubmitMvpVoteInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayerId = membership.roles.includes('player')
        ? await ensureCurrentUserPlayerForActiveTeam(actorUserId)
        : null;
      const currentMatch = await fetchMatchByIdForTeam(activeTeamId, input.matchId);

      if (!membership.roles.includes('player') || !currentPlayerId) {
        throw createRepositoryError(
          'Vincule sua conta a um jogador do time para votar no MVP.',
          'permission-denied',
        );
      }

      if (currentMatch.status !== 'finished') {
        throw createRepositoryError(
          'A votacao do MVP so fica disponivel depois do fim da partida.',
          'failed-precondition',
        );
      }

      if (currentPlayerId === input.targetPlayerId) {
        throw createRepositoryError(
          'Você não pode votar em si mesmo.',
          'failed-precondition',
        );
      }

      const attendance = await fetchAttendanceByMatchIdForTeam(activeTeamId, currentMatch.id);
      const confirmedPlayerIds = new Set(
        attendance
          .filter((item) => item.status === 'confirmed')
          .map((item) => item.playerId),
      );

      if (!confirmedPlayerIds.has(currentPlayerId)) {
        throw createRepositoryError(
          'Somente jogadores confirmados podem votar no MVP.',
          'permission-denied',
        );
      }

      if (!confirmedPlayerIds.has(input.targetPlayerId)) {
        throw createRepositoryError(
          'O MVP precisa ser escolhido entre os jogadores confirmados.',
          'failed-precondition',
        );
      }

      const voteId = buildStableDocumentId(currentMatch.id, currentPlayerId);
      const voteRef = doc(firestore, FIRESTORE_COLLECTIONS.mvpVotes, voteId);
      const updatedAt = nowIso();
      const vote = normalizeMvpVoteDocument({
        id: voteId,
        teamId: currentMatch.teamId,
        matchId: currentMatch.id,
        voterPlayerId: currentPlayerId,
        targetPlayerId: input.targetPlayerId,
        createdAt: updatedAt,
        updatedAt,
      });

      await runTransaction(firestore, async (transaction) => {
        const existingVote = await transaction.get(voteRef);

        if (existingVote.exists()) {
          throw createRepositoryError(
            'Seu voto de MVP nesta partida ja foi registrado.',
            'failed-precondition',
          );
        }

        transaction.set(voteRef, vote);
      });

      const existingVotes = await fetchMvpVotesByMatchIdForTeam(activeTeamId, currentMatch.id);
      const nextSnapshot = {
        ...emptySnapshot,
        attendance,
        mvpVotes: existingVotes,
      };
      const mvpSummary = getMvpSummary(nextSnapshot, currentMatch.id);
      const updatedMatch = normalizeMatchDocument({
        ...currentMatch,
        mvpWinnerPlayerIds: mvpSummary.winnerPlayerIds,
        mvpTotalVotes: mvpSummary.totalVotes,
        updatedAt,
      });
      const winnerNotificationId = buildNotificationId('mvp-winner', currentMatch.id);
      const existingWinnerNotification = await fetchNotificationByIdForTeam(
        activeTeamId,
        winnerNotificationId,
      );
      const batch = writeBatch(firestore);
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.matches, currentMatch.id),
        updatedMatch,
      );

      if (mvpSummary.winnerPlayerIds.length === 1) {
        const winner = await fetchPlayerByIdForTeam(
          activeTeamId,
          mvpSummary.winnerPlayerIds[0],
        );
        batch.set(
          doc(firestore, FIRESTORE_COLLECTIONS.notifications, winnerNotificationId),
          createMvpWinnerNotification({
            id: winnerNotificationId,
            teamId: currentMatch.teamId,
            match: updatedMatch,
            winner,
            actorUserId,
            createdAt: existingWinnerNotification?.createdAt,
            updatedAt,
          }),
        );
      } else {
        batch.delete(
          doc(firestore, FIRESTORE_COLLECTIONS.notifications, winnerNotificationId),
        );
      }

      await batch.commit();

      return vote;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível registrar seu voto agora.',
      );
    }
  },

  async submitPlayerRating(
    input: SubmitPlayerRatingInput,
    actorUserId: string,
  ) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayerId = membership.roles.includes('player')
        ? await ensureCurrentUserPlayerForActiveTeam(actorUserId)
        : null;
      const currentMatch = await fetchMatchByIdForTeam(activeTeamId, input.matchId);

      if (!membership.roles.includes('player') || !currentPlayerId) {
        throw createRepositoryError(
          'Vincule sua conta a um jogador do time para enviar notas.',
          'permission-denied',
        );
      }

      if (currentMatch.status !== 'finished') {
        throw createRepositoryError(
          'As notas so ficam disponiveis depois do fim da partida.',
          'failed-precondition',
        );
      }

      if (currentPlayerId === input.targetPlayerId) {
        throw createRepositoryError(
          'Você não pode avaliar a si mesmo.',
          'failed-precondition',
        );
      }

      const attendance = await fetchAttendanceByMatchIdForTeam(activeTeamId, currentMatch.id);
      const teamCriteria = await loadTeamRatingCriteria(activeTeamId);
      const activeCriteria = getActiveRatingCriteria(teamCriteria);
      const confirmedPlayerIds = new Set(
        attendance
          .filter((item) => item.status === 'confirmed')
          .map((item) => item.playerId),
      );

      if (!confirmedPlayerIds.has(currentPlayerId)) {
        throw createRepositoryError(
          'Somente jogadores confirmados podem enviar notas.',
          'permission-denied',
        );
      }

      if (!confirmedPlayerIds.has(input.targetPlayerId)) {
        throw createRepositoryError(
          'Escolha um jogador confirmado para avaliar.',
          'failed-precondition',
        );
      }

      try {
        validateRatingCriteriaSubmission({
          activeCriteria,
          criteriaScores: input.criteriaScores,
        });
      } catch (error) {
        throw createRepositoryError(
          error instanceof Error ? error.message : 'Revise os critérios da avaliação.',
          'failed-precondition',
        );
      }

      const ratingId = buildStableDocumentId(
        currentMatch.id,
        currentPlayerId,
        input.targetPlayerId,
      );
      const ratingRef = doc(firestore, FIRESTORE_COLLECTIONS.playerRatings, ratingId);
      const updatedAt = nowIso();
      const criteriaSnapshot = buildRatingCriteriaSnapshot(activeCriteria);
      const rating = normalizePlayerRatingDocument({
        id: ratingId,
        teamId: currentMatch.teamId,
        matchId: currentMatch.id,
        raterPlayerId: currentPlayerId,
        targetPlayerId: input.targetPlayerId,
        criteriaScores: input.criteriaScores,
        criteriaSnapshot,
        overall: calculateOverallFromCriteriaScores({
          criteriaScores: input.criteriaScores,
          criteriaSnapshot,
        }),
        createdAt: updatedAt,
        updatedAt,
      });

      await runTransaction(firestore, async (transaction) => {
        const existingRating = await transaction.get(ratingRef);

        if (existingRating.exists()) {
          throw createRepositoryError(
            'Você já avaliou esse jogador nesta partida.',
            'failed-precondition',
          );
        }

        transaction.set(ratingRef, rating);
      });

      return rating;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível salvar sua avaliação agora.',
      );
    }
  },

  async markNotificationAsRead(notificationId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const notification = await fetchNotificationByIdForTeam(activeTeamId, notificationId);

      if (!notification) {
        throw createRepositoryError(
          'Notificação não encontrada.',
          'not-found',
        );
      }

      if (!canAccessNotification(notification, actor.id)) {
        throw createRepositoryError(
          'Você não pode abrir esta notificação.',
          'permission-denied',
        );
      }

      if (notification.readByUserIds.includes(actor.id)) {
        return;
      }

      await setDoc(
        doc(firestore, FIRESTORE_COLLECTIONS.notifications, notification.id),
        normalizeNotificationDocument({
          ...notification,
          readByUserIds: [...notification.readByUserIds, actor.id],
        }),
      );
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível atualizar essa notificação agora.',
      );
    }
  },

  async markAllNotificationsAsRead(actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const notifications = await fetchAccessibleNotificationsByTeamId(
        activeTeamId,
        actor.id,
      );
      const unreadNotifications = notifications.filter(
        (notification) => !notification.readByUserIds.includes(actor.id),
      );

      if (unreadNotifications.length === 0) {
        return;
      }

      const batch = writeBatch(firestore);

      for (const notification of unreadNotifications) {
        batch.set(
          doc(firestore, FIRESTORE_COLLECTIONS.notifications, notification.id),
          normalizeNotificationDocument({
            ...notification,
            readByUserIds: [...notification.readByUserIds, actor.id],
          }),
        );
      }

      await batch.commit();
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Não foi possível atualizar suas notificações agora.',
      );
    }
  },
};

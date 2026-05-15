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
import { buildLegacyMatchImportPreview } from '@/lib/match-import';
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
  normalizeEmail,
  resolvePlayerForUser,
} from '@/lib/player-linking';
import {
  buildNotificationId,
  createAttendanceNotification,
  createLineupPublishedNotification,
  createMatchCreatedNotification,
  createMatchFinishedNotification,
  createMatchUpdatedNotification,
  createMvpVotingOpenedNotification,
  createMvpWinnerNotification,
  createRatingsOpenedNotification,
} from '@/lib/notifications';
import {
  createEmptyManualStats,
  createInviteCode,
  deriveNickname,
  displayNameFromEmail,
  normalizeInviteCode,
  normalizeManualStats,
  slugifyTeamName,
} from '@/lib/team';
import { authService } from '@/services/auth';
import {
  type FirestoreAttendanceDocument,
  type FirestoreLineupDocument,
  type FirestoreMatchDocument,
  type FirestoreMatchStatDocument,
  type FirestoreMvpVoteDocument,
  type FirestoreNotificationDocument,
  type FirestorePlayerRatingDocument,
  FIRESTORE_COLLECTIONS,
  type FirestorePlayerDocument,
  type FirestoreTeamRatingCriterionDocument,
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
  MatchStat,
  MvpVote,
  Player,
  PlayerRating,
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
  type FinishMatchInput,
  type GoogleLoginInput,
  type RegisterFinishedMatchInput,
  type SaveLineupInput,
  type SubmitMvpVoteInput,
  type SubmitPlayerRatingInput,
  type SnapshotSubscriptionHandlers,
  type UpdateAttendanceInput,
  type UpdateMatchInput,
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
  'not-found': 'Nao encontramos o registro solicitado.',
  'permission-denied': 'Voce nao tem permissao para concluir esta acao.',
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

type ErrorWithCode = Error & { code?: string };
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
  mvpVotes: MvpVote[];
  playerRatings: PlayerRating[];
  notifications: AppNotification[];
  seasons: Season[];
}

function createRepositoryError(
  message: string,
  code = 'repository/custom-error',
) {
  const error = new Error(message) as ErrorWithCode;
  error.code = code;
  return error;
}

function toFriendlyFirestoreError(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof Error) {
    const code = (error as ErrorWithCode).code?.replace(/^firestore\//, '');
    if (code && firestoreErrorMessages[code]) {
      return createRepositoryError(firestoreErrorMessages[code], code);
    }

    if (error.message) {
      return createRepositoryError(error.message, code);
    }
  }

  return createRepositoryError(fallbackMessage);
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

function normalizeMatchVenue(venue?: string | null) {
  return venue?.trim() || 'Nao informado';
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
        'Os dados da conta ainda nao estao prontos para uso.',
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
    throw createRepositoryError('Documento nao encontrado.', 'not-found');
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
    roles: uniqueRoles,
    canManageTeam:
      membership.canManageTeam ?? uniqueRoles.includes('admin'),
    canManagePlayers:
      membership.canManagePlayers ?? uniqueRoles.includes('admin'),
    joinedAt: membership.joinedAt ?? membership.createdAt,
    status: membership.status ?? 'active',
  };
}

function normalizeTeamDocument(
  team: FirestoreTeamDocument,
): FirestoreTeamDocument {
  return {
    ...team,
    logoUrl: team.logoUrl ?? null,
    accentColor: team.accentColor ?? null,
    description: team.description ?? '',
    inviteCode: team.inviteCode ?? '',
    inviteCodeUpdatedAt: team.inviteCodeUpdatedAt ?? team.updatedAt,
    activeSeasonId: team.activeSeasonId ?? null,
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
    notes: match.notes ?? '',
    scoreboard: match.scoreboard
      ? {
          ...match.scoreboard,
          ownGoalsForTeam: match.scoreboard.ownGoalsForTeam ?? 0,
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
    actorUserId: notification.actorUserId ?? null,
    readByUserIds: [...new Set(notification.readByUserIds ?? [])],
  };
}

async function fetchUserById(userId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(doc(firestore, FIRESTORE_COLLECTIONS.users, userId));

  if (!snapshot.exists()) {
    throw createRepositoryError('Usuario nao encontrado.', 'not-found');
  }

  return normalizeUserDocument(parseDoc<FirestoreUserDocument>(snapshot));
}

async function fetchUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

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
}

async function fetchTeamById(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(doc(firestore, FIRESTORE_COLLECTIONS.teams, teamId));

  if (!snapshot.exists()) {
    throw createRepositoryError('Time nao encontrado.', 'not-found');
  }

  const team = normalizeTeamDocument(parseDoc<FirestoreTeamDocument>(snapshot));

  if (!team.inviteCode) {
    const migratedTeam = normalizeTeamDocument({
      ...team,
      inviteCode: createInviteCode(),
      inviteCodeUpdatedAt: nowIso(),
    });
    await setDoc(doc(firestore, FIRESTORE_COLLECTIONS.teams, team.id), migratedTeam);
    return migratedTeam;
  }

  return team;
}

async function fetchPlayerByIdForTeam(teamId: string, playerId: string) {
  const player = (await fetchPlayersByTeamId(teamId)).find((item) => item.id === playerId);

  if (!player) {
    throw createRepositoryError('Jogador nao encontrado.', 'not-found');
  }

  return player;
}

async function fetchMatchByIdForTeam(teamId: string, matchId: string) {
  const match = (await fetchMatchesByTeamId(teamId)).find((item) => item.id === matchId);

  if (!match) {
    throw createRepositoryError('Partida nao encontrada.', 'not-found');
  }

  return match;
}

async function fetchUsersByTeamId(teamId: string) {
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
}

async function fetchTeamMembersByUserId(userId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.teamMembers),
      where('userId', '==', userId),
    ),
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

async function fetchPlayersByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.players),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizePlayerDocument(parseDoc<FirestorePlayerDocument>(item)),
  );
}

async function fetchPlayersByLinkedUserId(userId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.players),
      where('linkedUserId', '==', userId),
    ),
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

  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.players),
      where('linkedEmail', '==', normalizedEmail),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizePlayerDocument(parseDoc<FirestorePlayerDocument>(item)),
  );
}

async function fetchMatchesByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.matches),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizeMatchDocument(parseDoc<FirestoreMatchDocument>(item)),
  );
}

async function fetchLineupsByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.lineups),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizeLineupDocument(parseDoc<FirestoreLineupDocument>(item)),
  );
}

async function fetchLineupByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchLineupsByTeamId(teamId)).find((item) => item.matchId === matchId) ?? null;
}

async function fetchAttendanceByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.attendance),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizeAttendanceDocument(parseDoc<FirestoreAttendanceDocument>(item)),
  );
}

async function fetchAttendanceByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchAttendanceByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchMatchStatsByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.matchStats),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizeMatchStatDocument(parseDoc<FirestoreMatchStatDocument>(item)),
  );
}

async function fetchMatchStatsByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchMatchStatsByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchMvpVotesByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.mvpVotes),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizeMvpVoteDocument(parseDoc<FirestoreMvpVoteDocument>(item)),
  );
}

async function fetchMvpVotesByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchMvpVotesByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchRatingCriteriaByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.ratingCriteria),
      where('teamId', '==', teamId),
    ),
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
      'Esse criterio nao pertence ao time atual.',
      'permission-denied',
    );
  }

  return criterion;
}

async function fetchPlayerRatingsByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.playerRatings),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizePlayerRatingDocument(parseDoc<FirestorePlayerRatingDocument>(item)),
  );
}

async function fetchPlayerRatingsByMatchIdForTeam(teamId: string, matchId: string) {
  return (await fetchPlayerRatingsByTeamId(teamId)).filter((item) => item.matchId === matchId);
}

async function fetchNotificationsByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.notifications),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizeNotificationDocument(parseDoc<FirestoreNotificationDocument>(item)),
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
      'Essa notificacao nao pertence ao time atual.',
      'permission-denied',
    );
  }

  return notification;
}

async function fetchSeasonsByTeamId(teamId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.seasons),
      where('teamId', '==', teamId),
    ),
  );

  return snapshot.docs.map((item) => parseDoc<FirestoreSeasonDocument>(item)) as Season[];
}

async function fetchTeamByInviteCode(inviteCode: string) {
  const firestore = requireFirestore();
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.teams),
      where('inviteCode', '==', normalizedInviteCode),
    ),
  );

  const teamDocument = snapshot.docs[0];
  if (!teamDocument) {
    return null;
  }

  return normalizeTeamDocument(parseDoc<FirestoreTeamDocument>(teamDocument));
}

async function ensureTeamRatingCriteria(teamId: string) {
  const existingCriteria = await fetchRatingCriteriaByTeamId(teamId);

  if (existingCriteria.length > 0) {
    return existingCriteria;
  }

  const firestore = requireFirestore();
  const now = nowIso();
  const defaultCriteria = createDefaultTeamRatingCriteria(teamId, now);
  const batch = writeBatch(firestore);

  for (const criterion of defaultCriteria) {
    batch.set(
      doc(firestore, FIRESTORE_COLLECTIONS.ratingCriteria, criterion.id),
      criterion,
    );
  }

  await batch.commit();
  return defaultCriteria;
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

async function ensureCurrentUserDocument() {
  const sessionUser =
    authService.getCurrentUser() ?? (await authService.restoreSession());

  if (!sessionUser) {
    return null;
  }

  const firestore = requireFirestore();
  const userRef = doc(firestore, FIRESTORE_COLLECTIONS.users, sessionUser.authId);
  const existing = await getDoc(userRef);
  const email = normalizeEmail(sessionUser.email);
  const displayName =
    sessionUser.displayName.trim() || displayNameFromEmail(email);
  const avatarUrl = sessionUser.avatarUrl?.trim() || null;
  const now = nowIso();

  if (!existing.exists()) {
    const user: FirestoreUserDocument = normalizeUserDocument({
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

    await setDoc(userRef, user);
    return user;
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
    currentUser.email !== email ||
    currentUser.displayName !== displayName ||
    currentUser.avatarUrl !== avatarUrl ||
    needsMigration
  ) {
    const updatedUser = normalizeUserDocument({
      ...currentUser,
      email,
      displayName,
      avatarUrl,
      updatedAt: now,
    });

    await setDoc(userRef, updatedUser);
    return updatedUser;
  }

  return currentUser;
}

function buildTeamMemberDocument(input: {
  id: string;
  userId: string;
  teamId: string;
  playerId: string | null;
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
      normalizedById.set(inactiveMembership.id, inactiveMembership);
    }
  }

  await batch.commit();

  return [...normalizedById.values()].filter((membership) => membership.userId === userId);
}

async function persistUserContext(
  user: User,
  activeMembership: TeamMember | null,
  teamsById: Map<string, Team>,
) {
  const firestore = requireFirestore();
  const activeTeam =
    activeMembership ? teamsById.get(activeMembership.teamId) ?? null : null;
  const updatedUser = normalizeUserDocument({
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

  await setDoc(doc(firestore, FIRESTORE_COLLECTIONS.users, user.id), updatedUser);
  return updatedUser;
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

async function ensureMembershipsForUser(user: User) {
  const firestore = requireFirestore();
  await repairCurrentUserMembershipsByLinkedPlayers(user);
  let memberships = await reconcileDuplicateMemberships(
    user.id,
    await fetchTeamMembersByUserId(user.id),
  );
  const legacyTeamId = user.activeTeamId ?? user.teamId ?? null;

  if (legacyTeamId && !memberships.some((membership) => membership.teamId === legacyTeamId)) {
    let playerId =
      user.playerId ??
      (await fetchPlayersByTeamId(legacyTeamId)).find((player) => player.linkedUserId === user.id)?.id ??
      null;

    const legacyTeam = await fetchTeamById(legacyTeamId);
    const roles: TeamMember['roles'] = [];
    if (
      legacyTeam.adminUserId === user.id ||
      user.appRole === 'team_admin' ||
      user.appRole === 'owner'
    ) {
      roles.push('admin');
    }
    if (playerId || roles.length === 0 || user.appRole === 'player') {
      roles.push('player');
    }

    const membershipRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.teamMembers));
    const createdMembership = buildTeamMemberDocument({
      id: membershipRef.id,
      userId: user.id,
      teamId: legacyTeamId,
      playerId,
      roles,
      canManageTeam: roles.includes('admin'),
      canManagePlayers: roles.includes('admin'),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      joinedAt: user.createdAt,
    });

    await setDoc(membershipRef, createdMembership);
    memberships = [...memberships, createdMembership];
  }

  const teams = await fetchTeamsByIds(memberships.map((membership) => membership.teamId));
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  let activeMembership =
    memberships.find(
      (membership) =>
        membership.teamId === user.activeTeamId && membership.status === 'active',
    ) ??
    memberships.find((membership) => membership.status === 'active') ??
    null;
  let currentUser = user;

  if (activeMembership?.roles.includes('player')) {
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
  const syncedUser = contextOutOfSync
    ? await persistUserContext(currentUser, activeMembership, teamsById)
    : currentUser;

  return {
    user: syncedUser,
    memberships,
    teams,
  };
}

async function buildSnapshotForCurrentUser(): Promise<AppSnapshot> {
  const sessionUser = await ensureCurrentUserDocument();

  if (!sessionUser) {
    return emptySnapshot;
  }
  const { user, memberships, teams } = await ensureMembershipsForUser(sessionUser);
  const activeMembership =
    memberships.find((membership) => membership.teamId === user.activeTeamId) ?? null;
  const activeTeamId = activeMembership?.teamId ?? null;
  const [
    ratingCriteria,
    players,
    matches,
    lineups,
    attendance,
    matchStats,
    mvpVotes,
    playerRatings,
    notifications,
    seasons,
  ] = activeTeamId
    ? await Promise.all([
        ensureTeamRatingCriteria(activeTeamId),
        fetchPlayersByTeamId(activeTeamId),
        fetchMatchesByTeamId(activeTeamId),
        fetchLineupsByTeamId(activeTeamId),
        fetchAttendanceByTeamId(activeTeamId),
        fetchMatchStatsByTeamId(activeTeamId),
        fetchMvpVotesByTeamId(activeTeamId),
        fetchPlayerRatingsByTeamId(activeTeamId),
        fetchNotificationsByTeamId(activeTeamId),
        fetchSeasonsByTeamId(activeTeamId),
      ])
    : [[], [], [], [], [], [], [], [], [], []];

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
    mvpVotes,
    playerRatings,
    notifications,
    seasons,
  };
}

async function buildSnapshotForUserId(userId: string): Promise<AppSnapshot> {
  const sessionUser = authService.getCurrentUser();
  const currentUser =
    sessionUser?.authId === userId
      ? await ensureCurrentUserDocument()
      : await fetchUserById(userId);

  if (!currentUser) {
    return emptySnapshot;
  }

  const { user, memberships, teams } = await ensureMembershipsForUser(currentUser);
  const activeMembership =
    memberships.find((membership) => membership.teamId === user.activeTeamId) ?? null;
  const activeTeamId = activeMembership?.teamId ?? null;
  const [
    ratingCriteria,
    players,
    matches,
    lineups,
    attendance,
    matchStats,
    mvpVotes,
    playerRatings,
    notifications,
    seasons,
  ] = activeTeamId
    ? await Promise.all([
        ensureTeamRatingCriteria(activeTeamId),
        fetchPlayersByTeamId(activeTeamId),
        fetchMatchesByTeamId(activeTeamId),
        fetchLineupsByTeamId(activeTeamId),
        fetchAttendanceByTeamId(activeTeamId),
        fetchMatchStatsByTeamId(activeTeamId),
        fetchMvpVotesByTeamId(activeTeamId),
        fetchPlayerRatingsByTeamId(activeTeamId),
        fetchNotificationsByTeamId(activeTeamId),
        fetchSeasonsByTeamId(activeTeamId),
      ])
    : [[], [], [], [], [], [], [], [], [], []];

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
    mvpVotes,
    playerRatings,
    notifications,
    seasons,
  };
}

function resolveActiveMembership(user: User | null, memberships: TeamMember[]) {
  return (
    memberships.find(
      (membership) =>
        membership.status === 'active' && membership.teamId === user?.activeTeamId,
    ) ??
    memberships.find((membership) => membership.status === 'active') ??
    null
  );
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
    mvpVotes: snapshot.mvpVotes,
    playerRatings: snapshot.playerRatings,
    notifications: snapshot.notifications,
    seasons: snapshot.seasons,
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
    mvpVotes: state.mvpVotes,
    playerRatings: state.playerRatings,
    notifications: state.notifications,
    seasons: state.seasons,
  };
}

async function createUniqueInviteCode(excludedTeamId?: string) {
  let inviteCode = createInviteCode();

  while (true) {
    const team = await fetchTeamByInviteCode(inviteCode);
    if (!team || team.id === excludedTeamId) {
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
      'A escalacao tem jogadores repetidos. Revise titulares e reservas.',
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
        'Nao repita o mesmo jogador mais de uma vez na partida.',
        'failed-precondition',
      );
    }

    if (item.goals < 0 || item.assists < 0) {
      throw createRepositoryError(
        'Gols e assistencias nao podem ser negativos.',
        'failed-precondition',
      );
    }

    if (!item.played && (item.goals > 0 || item.assists > 0)) {
      throw createRepositoryError(
        'Um jogador marcado como ausente nao pode receber estatisticas.',
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
      'A soma de gols dos jogadores nao pode ultrapassar o placar do time.',
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
      'O placar nao pode ter numeros negativos.',
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
  if (!input.membership.roles.includes('player')) {
    return {
      user: input.user,
      membership: input.membership,
      player: null as Player | null,
    };
  }

  const firestore = requireFirestore();
  const updatedAt = nowIso();
  const normalizedUserEmail = normalizeEmail(input.user.email);
  const teamPlayers = await fetchPlayersByTeamId(input.team.id);
  let player = resolvePlayerForUser({
    teamPlayers,
    teamId: input.team.id,
    user: input.user,
    membership: input.membership,
  });

  const batch = writeBatch(firestore);
  let hasChanges = false;

  if (player) {
    const normalizedPlayer = normalizePlayerDocument({
      ...player,
      linkedUserId: input.user.id,
      linkedEmail: normalizedUserEmail,
      updatedAt,
    });

    if (
      normalizedPlayer.linkedUserId !== player.linkedUserId ||
      normalizedPlayer.linkedEmail !== player.linkedEmail ||
      normalizedPlayer.updatedAt !== player.updatedAt
    ) {
      batch.set(
        doc(firestore, FIRESTORE_COLLECTIONS.players, normalizedPlayer.id),
        normalizedPlayer,
      );
      hasChanges = true;
    }

    player = normalizedPlayer;
  } else {
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

  let membership = input.membership;
  if (membership.playerId !== player.id) {
    membership = buildTeamMemberDocument({
      ...membership,
      playerId: player.id,
      updatedAt,
    });
    batch.set(
      doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, membership.id),
      membership,
    );
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

  if (!user.activeTeamId || !activeMembership || !activeMembership.roles.includes('player')) {
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

  return repaired.player?.id ?? repaired.membership.playerId ?? null;
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
      'Seu acesso ao time atual nao esta disponivel.',
      'permission-denied',
    );
  }

  const activeTeam =
    teams.find((team) => team.id === activeTeamId) ?? null;

  if (activeTeam && membership.roles.includes('player')) {
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

async function ensureSelfPlayerEdit(userId: string, player: Player) {
  const { actor, membership } = await ensureMembershipContext(userId, player.teamId);
  const ownPlayerId = membership?.roles.includes('player')
    ? await ensureCurrentUserPlayerForActiveTeam(userId)
    : null;

  if (!membership?.roles.includes('player') || ownPlayerId !== player.id) {
    throw createRepositoryError(
      'Voce nao tem permissao para editar esse jogador.',
      'permission-denied',
    );
  }

  return { actor, membership };
}

async function upsertTeamMemberDocument(input: {
  userId: string;
  teamId: string;
  playerId: string | null;
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

  await setDoc(membershipRef, membership);
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
    linkedUser = await fetchUserByEmail(normalizedLinkedEmail);
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
  await setDoc(
    doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, membership.id),
    updatedMembership,
  );

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
        'Nao foi possivel carregar os dados iniciais agora.',
      );
    }
  },

  async getSnapshot() {
    try {
      return await buildSnapshotForCurrentUser();
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel atualizar os dados agora.',
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
    let activeTeamId = resolveActiveMembership(state.user, state.memberships)?.teamId ?? null;

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
          'Nao foi possivel atualizar os dados do time agora.',
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
      listenToTeamCollection<FirestoreNotificationDocument>(
        'notifications',
        FIRESTORE_COLLECTIONS.notifications,
        normalizeNotificationDocument,
        (items) => {
          state.notifications = items;
        },
      );
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
          syncTeamListeners([]);
          bindActiveTeamListeners(null);
          emitSnapshot();
          return;
        }

        state.user = normalizeUserDocument(parseDoc<FirestoreUserDocument>(snapshot));
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
      const user = await ensureCurrentUserDocument();

      if (!user) {
        throw createRepositoryError('Nao foi possivel abrir a sessao do usuario.');
      }

      return user;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel entrar agora.',
      );
    }
  },

  async loginWithGoogle(input: GoogleLoginInput) {
    try {
      await authService.loginWithGoogle(input);
      const user = await ensureCurrentUserDocument();

      if (!user) {
        throw createRepositoryError('Nao foi possivel abrir a sessao do usuario.');
      }

      return user;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel entrar com Google agora.',
      );
    }
  },

  async register(input) {
    try {
      await authService.register(input);
      const user = await ensureCurrentUserDocument();

      if (!user) {
        throw createRepositoryError('Nao foi possivel criar a conta agora.');
      }

      return user;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel criar a conta agora.',
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

      if (!admin.canCreateTeam) {
        throw createRepositoryError(
          'Seu acesso ainda nao permite criar um time.',
          'permission-denied',
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
      batch.set(ownerPlayerRef, ownerPlayer);
      batch.set(membershipRef, membership);
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
        'Nao foi possivel criar o time agora.',
      );
    }
  },

  async updateTeam(teamId: string, input: UpdateTeamInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      await ensureTeamAdmin(actorUserId, teamId);
      const currentTeam = await fetchTeamById(teamId);
      const updatedAt = nowIso();

      const updatedTeam = normalizeTeamDocument({
        ...currentTeam,
        name: input.name.trim(),
        coachName: input.coachName.trim(),
        slug: slugifyTeamName(input.slug.trim() || input.name),
        logoUrl: input.logoUrl?.trim() || null,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        accentColor: input.accentColor ?? null,
        description: input.description?.trim() ?? '',
        updatedAt,
      });

      await setDoc(doc(firestore, FIRESTORE_COLLECTIONS.teams, currentTeam.id), updatedTeam);
      return updatedTeam;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel salvar as configuracoes do time.',
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

      await setDoc(doc(firestore, FIRESTORE_COLLECTIONS.teams, currentTeam.id), updatedTeam);
      return updatedTeam;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel gerar um novo codigo agora.',
      );
    }
  },

  async createRatingCriterion(input: CreateRatingCriterionInput, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { activeTeamId } = await ensureActiveTeamContext(actorUserId);
      await ensureTeamAdmin(actorUserId, activeTeamId);
      const now = nowIso();
      const existingCriteria = await ensureTeamRatingCriteria(activeTeamId);
      const activeCount = getActiveRatingCriteria(existingCriteria).length;
      const shouldActivate = input.active !== false;

      if (shouldActivate && activeCount >= 12) {
        throw createRepositoryError(
          'Use no maximo 12 criterios ativos por time.',
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
        'Nao foi possivel criar o criterio agora.',
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
          'Criterio de avaliacao nao encontrado.',
          'not-found',
        );
      }

      const nextCriteria = (await ensureTeamRatingCriteria(activeTeamId)).map((item) =>
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
          'Use no maximo 12 criterios ativos por time.',
          'failed-precondition',
        );
      }

      const persistedCriteria = await persistTeamRatingCriteria(nextCriteria);
      return persistedCriteria.find((item) => item.id === criterion.id)!;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel atualizar o criterio agora.',
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
          'Criterio de avaliacao nao encontrado.',
          'not-found',
        );
      }

      const teamCriteria = await ensureTeamRatingCriteria(activeTeamId);
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
        'Nao foi possivel remover o criterio agora.',
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
          'Voce ainda nao participa desse time.',
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
        'Nao foi possivel trocar de time agora.',
      );
    }
  },

  async joinTeamWithInviteCode(inviteCode: string, userId: string) {
    try {
      const firestore = requireFirestore();
      const sessionUser = await fetchUserById(userId);
      const { user } = await ensureMembershipsForUser(sessionUser);

      const team = await fetchTeamByInviteCode(inviteCode);
      if (!team) {
        throw createRepositoryError(
          'Nao encontramos um time com esse codigo.',
          'not-found',
        );
      }

      const existingMembership = await fetchTeamMemberByUserAndTeam(user.id, team.id);
      if (existingMembership?.status === 'active') {
        await persistUserContext(
          user,
          existingMembership,
          new Map([[team.id, team]]),
        );
        return {
          team,
          alreadyMember: true,
        };
      }

      const teamPlayers = (await fetchPlayersByTeamId(team.id)).filter(isActivePlayer);
      const normalizedUserEmail = normalizeEmail(user.email);
      const existingPlayer =
        teamPlayers.find((player) => player.linkedUserId === user.id) ??
        teamPlayers.find(
          (player) =>
            !player.linkedUserId &&
            normalizeEmail(player.linkedEmail ?? '') === normalizedUserEmail,
        ) ??
        null;
      const updatedAt = nowIso();
      const batch = writeBatch(firestore);
      let playerId = existingPlayer?.id ?? null;

      if (existingPlayer) {
        const updatedPlayer = normalizePlayerDocument({
          ...existingPlayer,
          linkedUserId: user.id,
          linkedEmail: normalizedUserEmail,
          updatedAt,
        });

        batch.set(doc(firestore, FIRESTORE_COLLECTIONS.players, existingPlayer.id), updatedPlayer);
        playerId = existingPlayer.id;
      } else {
        const playerRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.players));
        const basicPlayer = buildBasicPlayerFromUser(
          team.id,
          user,
          await nextJerseyNumber(team.id),
        );
        const createdPlayer = normalizePlayerDocument({
          ...basicPlayer,
          id: playerRef.id,
        });

        batch.set(playerRef, createdPlayer);
        playerId = createdPlayer.id;
      }

      const membership = buildTeamMemberDocument({
        id:
          existingMembership?.id ??
          doc(collection(firestore, FIRESTORE_COLLECTIONS.teamMembers)).id,
        userId: user.id,
        teamId: team.id,
        playerId,
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
        appRole: resolveTeamAppRole(user, team, membership),
        activeTeamId: team.id,
        teamId: team.id,
        playerId,
        updatedAt,
      });

      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.teamMembers, membership.id), membership);
      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.users, user.id), updatedUser);
      await batch.commit();

      if (playerId) {
        await ensureOpenMatchAttendanceForPlayer(
          await fetchPlayerByIdForTeam(team.id, playerId),
          updatedAt,
        );
      }

      return {
        team,
        alreadyMember: false,
      };
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel entrar no time agora.',
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

      return player;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel salvar o jogador agora.',
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

      if (canManagePlayer) {
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
      return updatedPlayer;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel atualizar o jogador agora.',
      );
    }
  },

  async removePlayer(playerId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayer = await fetchPlayerByIdForTeam(activeTeamId, playerId);
      const currentTeam = await fetchTeamById(currentPlayer.teamId);
      if (!membership.canManagePlayers) {
        throw createRepositoryError(
          'Apenas quem gerencia o elenco pode fazer essa acao.',
          'permission-denied',
        );
      }

      if (currentPlayer.deletedAt || currentPlayer.status === 'inactive') {
        throw createRepositoryError(
          'Esse jogador ja foi removido do elenco ativo.',
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
        ...currentPlayer,
        status: 'inactive',
        deletedAt: updatedAt,
        updatedAt,
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

      return updatedPlayer;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel remover o jogador agora.',
      );
    }
  },

  async reactivatePlayer(playerId: string, actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { membership, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const currentPlayer = await fetchPlayerByIdForTeam(activeTeamId, playerId);
      const currentTeam = await fetchTeamById(currentPlayer.teamId);

      if (!membership.canManagePlayers) {
        throw createRepositoryError(
          'Apenas quem gerencia o elenco pode fazer essa acao.',
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
        ...currentPlayer,
        linkedUserId: linkResult.linkedUserId,
        linkedEmail: linkResult.linkedEmail,
        status: 'active',
        deletedAt: null,
        updatedAt: now,
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

      return updatedPlayer;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel reativar o jogador agora.',
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
        'Nao foi possivel criar a partida agora.',
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
        linePlayersCount: input.linePlayersCount,
        matchType: input.matchType,
        notes: input.notes?.trim() ?? '',
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
      return updatedMatch;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel salvar a partida agora.',
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
          'A presenca desta partida nao aceita mais alteracoes.',
          'failed-precondition',
        );
      }

      const player = await ensurePlayerBelongsToTeam(input.playerId, match.teamId);
      const canManageAttendance = membership.canManageTeam === true;
      const isOwnAttendance = currentPlayerId === player.id;

      if (!canManageAttendance && !isOwnAttendance) {
        throw createRepositoryError(
          'Voce so pode responder a sua propria presenca.',
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
        'Nao foi possivel atualizar a presenca agora.',
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
          'A escalacao so pode ser salva antes do encerramento da partida.',
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
          'Confirme a presenca do elenco antes de salvar a escalacao.',
          'failed-precondition',
        );
      }

      for (const starter of input.starters) {
        await ensurePlayerBelongsToTeam(starter.playerId, match.teamId);
        if (!confirmedPlayerIds.has(starter.playerId)) {
          throw createRepositoryError(
            'A escalacao aceita apenas jogadores confirmados.',
            'failed-precondition',
          );
        }
      }

      for (const playerId of input.benchPlayerIds) {
        await ensurePlayerBelongsToTeam(playerId, match.teamId);
        if (!confirmedPlayerIds.has(playerId)) {
          throw createRepositoryError(
            'A escalacao aceita apenas jogadores confirmados.',
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
        'Nao foi possivel salvar a escalacao agora.',
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
          'Uma partida cancelada nao pode ser encerrada.',
          'failed-precondition',
        );
      }

      const ownGoalsForTeam = input.ownGoalsForTeam ?? 0;

      if (input.teamScore < 0 || input.opponentScore < 0 || ownGoalsForTeam < 0) {
        throw createRepositoryError(
          'O placar nao pode ter numeros negativos.',
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
          'Confirme a presenca do elenco antes de fechar a partida.',
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
            'Gols e assistencias nao podem ser negativos.',
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
      const updatedMatch = normalizeMatchDocument({
        ...currentMatch,
        status: 'finished',
        scoreboard: {
          team: input.teamScore,
          opponent: input.opponentScore,
          ownGoalsForTeam,
          result: calculateMatchResult(input.teamScore, input.opponentScore),
        },
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
      return updatedMatch;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel encerrar a partida agora.',
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
        'Nao foi possivel registrar o jogo antigo agora.',
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
        'Nao foi possivel gerar a previa da importacao agora.',
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
        'Nao foi possivel importar os jogos agora.',
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
          'Voce nao pode votar em si mesmo.',
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
        'Nao foi possivel registrar seu voto agora.',
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
          'Voce nao pode avaliar a si mesmo.',
          'failed-precondition',
        );
      }

      const attendance = await fetchAttendanceByMatchIdForTeam(activeTeamId, currentMatch.id);
      const teamCriteria = await ensureTeamRatingCriteria(activeTeamId);
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
          error instanceof Error ? error.message : 'Revise os criterios da avaliacao.',
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
            'Voce ja avaliou esse jogador nesta partida.',
            'failed-precondition',
          );
        }

        transaction.set(ratingRef, rating);
      });

      return rating;
    } catch (error) {
      throw toFriendlyFirestoreError(
        error,
        'Nao foi possivel salvar sua avaliacao agora.',
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
          'Notificacao nao encontrada.',
          'not-found',
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
        'Nao foi possivel atualizar essa notificacao agora.',
      );
    }
  },

  async markAllNotificationsAsRead(actorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor, activeTeamId } = await ensureActiveTeamContext(actorUserId);
      const notifications = await fetchNotificationsByTeamId(activeTeamId);
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
        'Nao foi possivel atualizar suas notificacoes agora.',
      );
    }
  },
};

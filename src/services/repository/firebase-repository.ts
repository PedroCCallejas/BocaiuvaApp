import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import {
  db,
  firebaseConfigError,
  firebaseEnabled,
} from '@/config/firebase/client';
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
  FIRESTORE_COLLECTIONS,
  type FirestorePlayerDocument,
  type FirestoreTeamDocument,
  type FirestoreTeamMemberDocument,
  type FirestoreUserDocument,
} from '@/types/firestore';
import type {
  AttendanceRecord,
  Lineup,
  Match,
  Player,
  Team,
  TeamMember,
  User,
} from '@/types/domain';

import {
  emptySnapshot,
  type AppRepository,
  type AppSnapshot,
  type CreatePlayerInput,
  type CreateTeamInput,
  type CreateMatchInput,
  type FinishMatchInput,
  type GoogleLoginInput,
  type SaveLineupInput,
  type UpdateAttendanceInput,
  type UpdateMatchInput,
  type UpdateTeamInput,
  type UpdatePlayerInput,
} from './types';

const unsupportedFirestoreFeatureMessage =
  'Essa funcao estara disponivel em breve.';

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
  };

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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
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
  };
}

function normalizeMatchDocument(
  match: FirestoreMatchDocument,
): FirestoreMatchDocument {
  return {
    ...match,
    seasonId: match.seasonId ?? null,
    opponentLogoUrl: match.opponentLogoUrl ?? null,
    notes: match.notes ?? '',
    scoreboard: match.scoreboard ?? null,
    finishedAt: match.finishedAt ?? null,
    mvpWinnerPlayerIds: match.mvpWinnerPlayerIds ?? [],
    mvpTotalVotes: match.mvpTotalVotes ?? 0,
  };
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

async function fetchUserById(userId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(doc(firestore, FIRESTORE_COLLECTIONS.users, userId));

  if (!snapshot.exists()) {
    throw createRepositoryError('Usuario nao encontrado.', 'not-found');
  }

  return normalizeUserDocument(parseDoc<FirestoreUserDocument>(snapshot));
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

async function fetchPlayerById(playerId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(
    doc(firestore, FIRESTORE_COLLECTIONS.players, playerId),
  );

  if (!snapshot.exists()) {
    throw createRepositoryError('Jogador nao encontrado.', 'not-found');
  }

  return normalizePlayerDocument(parseDoc<FirestorePlayerDocument>(snapshot));
}

async function fetchMatchById(matchId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDoc(doc(firestore, FIRESTORE_COLLECTIONS.matches, matchId));

  if (!snapshot.exists()) {
    throw createRepositoryError('Partida nao encontrada.', 'not-found');
  }

  return normalizeMatchDocument(parseDoc<FirestoreMatchDocument>(snapshot));
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
  const memberships = await fetchTeamMembersByUserId(userId);
  return memberships.find((membership) => membership.teamId === teamId) ?? null;
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

async function fetchLineupByMatchId(matchId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.lineups),
      where('matchId', '==', matchId),
    ),
  );

  const lineupDocument = snapshot.docs[0];
  if (!lineupDocument) {
    return null;
  }

  return normalizeLineupDocument(parseDoc<FirestoreLineupDocument>(lineupDocument));
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

async function fetchAttendanceByMatchId(matchId: string) {
  const firestore = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(firestore, FIRESTORE_COLLECTIONS.attendance),
      where('matchId', '==', matchId),
    ),
  );

  return snapshot.docs.map((item) =>
    normalizeAttendanceDocument(parseDoc<FirestoreAttendanceDocument>(item)),
  );
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
    rawUser?.avatarUrl === undefined;

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

async function ensureMembershipsForUser(user: User) {
  const firestore = requireFirestore();
  let memberships = await fetchTeamMembersByUserId(user.id);
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
  const activeMembership =
    memberships.find((membership) => membership.teamId === user.activeTeamId) ??
    memberships[0] ??
    null;
  const contextOutOfSync =
    user.activeTeamId !== (activeMembership?.teamId ?? null) ||
    user.teamId !== (activeMembership?.teamId ?? null) ||
    user.playerId !== (activeMembership?.playerId ?? null);
  const syncedUser = contextOutOfSync
    ? await persistUserContext(user, activeMembership, teamsById)
    : user;

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
  const [players, matches, lineups, attendance] = activeTeamId
    ? await Promise.all([
        fetchPlayersByTeamId(activeTeamId),
        fetchMatchesByTeamId(activeTeamId),
        fetchLineupsByTeamId(activeTeamId),
        fetchAttendanceByTeamId(activeTeamId),
      ])
    : [[], [], [], []];

  return {
    ...emptySnapshot,
    users: [user],
    teams,
    teamMembers: memberships,
    players,
    matches,
    lineups,
    attendance,
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
  const player = await fetchPlayerById(playerId);

  if (player.teamId !== teamId) {
    throw createRepositoryError(
      'Jogador nao pertence ao time informado.',
      'failed-precondition',
    );
  }

  return player;
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

async function ensureMembershipContext(userId: string, teamId: string) {
  const actor = await fetchUserById(userId);
  const { user, memberships } = await ensureMembershipsForUser(actor);
  const membership =
    memberships.find(
      (item) => item.teamId === teamId && item.status === 'active',
    ) ?? null;

  return {
    actor: user,
    membership,
  };
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

  if (!membership?.roles.includes('player') || membership.playerId !== player.id) {
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

function unsupportedFeature(): never {
  throw createRepositoryError(
    unsupportedFirestoreFeatureMessage,
    'not-implemented',
  );
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

      const teamPlayers = await fetchPlayersByTeamId(team.id);
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

      const membershipRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.teamMembers));
      const membership = buildTeamMemberDocument({
        id: membershipRef.id,
        userId: user.id,
        teamId: team.id,
        playerId,
        roles: ['player'],
        canManageTeam: false,
        canManagePlayers: false,
        createdAt: updatedAt,
        updatedAt,
        joinedAt: updatedAt,
      });
      const updatedUser = normalizeUserDocument({
        ...user,
        appRole: resolveTeamAppRole(user, team, membership),
        activeTeamId: team.id,
        teamId: team.id,
        playerId,
        updatedAt,
      });

      batch.set(membershipRef, membership);
      batch.set(doc(firestore, FIRESTORE_COLLECTIONS.users, user.id), updatedUser);
      await batch.commit();
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
      await ensurePlayerManager(actorUserId, input.teamId);
      await assertJerseyAvailable(input.teamId, input.jerseyNumber);

      const teamPlayers = await fetchPlayersByTeamId(input.teamId);
      const linkedUser = input.linkedUserId
        ? await validateLinkedUserAssignment(input.linkedUserId, input.teamId)
        : null;
      const linkedEmail = validateLinkedEmailAssignment(
        teamPlayers,
        linkedUser?.email ?? input.linkedEmail,
      );
      const team = await fetchTeamById(input.teamId);

      const now = nowIso();
      const playerRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.players));
      const player: FirestorePlayerDocument = normalizePlayerDocument({
        id: playerRef.id,
        teamId: input.teamId,
        linkedUserId: input.linkedUserId ?? null,
        linkedEmail,
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

      if (linkedUser) {
        await syncLinkedUserMembership({
          linkedUser,
          team,
          playerId: player.id,
          updatedAt: now,
        });
      }

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
      const currentPlayer = await fetchPlayerById(playerId);
      const currentTeam = await fetchTeamById(currentPlayer.teamId);
      const now = nowIso();
      const playerRef = doc(firestore, FIRESTORE_COLLECTIONS.players, playerId);
      const { membership } = await ensureMembershipContext(actorUserId, currentPlayer.teamId);
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
        const linkedUser =
          typeof input.linkedUserId === 'string'
            ? await validateLinkedUserAssignment(
                input.linkedUserId,
                currentPlayer.teamId,
                currentPlayer.id,
              )
            : null;
        const nextLinkedEmail = validateLinkedEmailAssignment(
          teamPlayers,
          linkedUser?.email ??
            (input.linkedEmail !== undefined
              ? input.linkedEmail
              : currentPlayer.linkedEmail),
          currentPlayer.id,
        );

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
          linkedUserId:
            input.linkedUserId !== undefined
              ? input.linkedUserId
              : currentPlayer.linkedUserId ?? null,
          linkedEmail:
            linkedUser?.email ??
            (input.linkedEmail !== undefined
              ? nextLinkedEmail
              : currentPlayer.linkedEmail ?? null),
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
              linkedUser ?? (await fetchUserById(updatedPlayer.linkedUserId)),
            team: currentTeam,
            playerId: updatedPlayer.id,
            updatedAt: now,
          });
        }

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

  async createMatch(input: CreateMatchInput, creatorUserId: string) {
    try {
      const firestore = requireFirestore();
      const { actor } = await ensureTeamAdmin(creatorUserId, input.teamId);
      const teamPlayers = await fetchPlayersByTeamId(input.teamId);
      const createdAt = nowIso();
      const matchRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.matches));
      const match = normalizeMatchDocument({
        id: matchRef.id,
        teamId: input.teamId,
        seasonId: input.seasonId ?? null,
        date: input.date,
        time: input.time,
        venue: input.venue.trim(),
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

      for (const player of teamPlayers) {
        const attendanceRef = doc(collection(firestore, FIRESTORE_COLLECTIONS.attendance));
        const attendance = normalizeAttendanceDocument({
          id: attendanceRef.id,
          teamId: input.teamId,
          matchId: match.id,
          playerId: player.id,
          userId: player.linkedUserId ?? null,
          status: 'pending',
          respondedAt: null,
          createdAt,
          updatedAt: createdAt,
        });
        batch.set(attendanceRef, attendance);
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
      const currentMatch = await fetchMatchById(matchId);
      await ensureTeamAdmin(actorUserId, currentMatch.teamId);
      const updatedAt = nowIso();
      const nextStatus = input.status ?? currentMatch.status;
      const updatedMatch = normalizeMatchDocument({
        ...currentMatch,
        seasonId: input.seasonId ?? currentMatch.seasonId ?? null,
        date: input.date,
        time: input.time,
        venue: input.venue.trim(),
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

      await setDoc(
        doc(firestore, FIRESTORE_COLLECTIONS.matches, currentMatch.id),
        updatedMatch,
      );
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
      const match = await fetchMatchById(input.matchId);
      const { actor, membership } = await ensureMembershipContext(
        actorUserId,
        match.teamId,
      );

      if (!membership) {
        throw createRepositoryError(
          'Voce ainda nao participa desse time.',
          'permission-denied',
        );
      }

      if (match.status === 'finished' || match.status === 'canceled') {
        throw createRepositoryError(
          'A presenca desta partida nao aceita mais alteracoes.',
          'failed-precondition',
        );
      }

      const player = await ensurePlayerBelongsToTeam(input.playerId, match.teamId);
      const canManageAttendance = membership.canManageTeam === true;
      const isOwnAttendance = membership.playerId === player.id;

      if (!canManageAttendance && !isOwnAttendance) {
        throw createRepositoryError(
          'Voce so pode responder a sua propria presenca.',
          'permission-denied',
        );
      }

      const attendanceItems = await fetchAttendanceByMatchId(match.id);
      const existingRecord =
        attendanceItems.find((item) => item.playerId === player.id) ?? null;
      const recordRef = existingRecord
        ? doc(firestore, FIRESTORE_COLLECTIONS.attendance, existingRecord.id)
        : doc(collection(firestore, FIRESTORE_COLLECTIONS.attendance));
      const updatedAt = nowIso();
      const attendance = normalizeAttendanceDocument({
        id: recordRef.id,
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

      await setDoc(recordRef, attendance);
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
      const match = await fetchMatchById(input.matchId);
      await ensureTeamAdmin(actorUserId, match.teamId);

      if (match.status === 'finished' || match.status === 'canceled') {
        throw createRepositoryError(
          'A escalacao so pode ser salva antes do encerramento da partida.',
          'failed-precondition',
        );
      }

      validateLineupSlots(input);

      const attendance = await fetchAttendanceByMatchId(match.id);
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

      const existingLineup = await fetchLineupByMatchId(match.id);
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

      await setDoc(lineupRef, lineup);
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
      const currentMatch = await fetchMatchById(input.matchId);
      await ensureTeamAdmin(actorUserId, currentMatch.teamId);

      if (currentMatch.status === 'canceled') {
        throw createRepositoryError(
          'Uma partida cancelada nao pode ser encerrada.',
          'failed-precondition',
        );
      }

      const updatedAt = nowIso();
      const updatedMatch = normalizeMatchDocument({
        ...currentMatch,
        status: 'finished',
        scoreboard: {
          team: input.teamScore,
          opponent: input.opponentScore,
          result:
            input.teamScore > input.opponentScore
              ? 'win'
              : input.teamScore < input.opponentScore
                ? 'loss'
                : 'draw',
        },
        finishedAt: updatedAt,
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
        'Nao foi possivel encerrar a partida agora.',
      );
    }
  },

  async submitMvpVote() {
    return unsupportedFeature();
  },

  async submitPlayerRating() {
    return unsupportedFeature();
  },
};

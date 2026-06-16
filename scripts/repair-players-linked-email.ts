import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import {
  FieldPath,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type SetOptions,
} from 'firebase-admin/firestore';

type TeamMemberRole = 'admin' | 'player';
type TeamMemberStatus = 'active' | 'inactive';

type RepairOptions = {
  dryRun: boolean;
  credentialsPath: string | null;
  projectId: string | null;
};

type RawPlayerDocument = {
  id: string;
  teamId?: unknown;
  linkedEmail?: unknown;
  linkedUserId?: unknown;
  status?: unknown;
  deletedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type RawTeamMemberDocument = {
  id: string;
  userId?: unknown;
  teamId?: unknown;
  playerId?: unknown;
  inviteCodeUsed?: unknown;
  roles?: unknown;
  canManageTeam?: unknown;
  canManagePlayers?: unknown;
  joinedAt?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type RawUserDocument = {
  id: string;
  activeTeamId?: unknown;
  updatedAt?: unknown;
};

type NormalizedPlayer = {
  id: string;
  ref: DocumentReference;
  teamId: string;
  linkedEmail: string | null;
  normalizedLinkedEmail: string;
  linkedUserId: string | null;
  status: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NormalizedTeamMember = {
  id: string;
  ref: DocumentReference;
  userId: string;
  teamId: string;
  playerId: string | null;
  inviteCodeUsed: string | null;
  roles: TeamMemberRole[];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  joinedAt: string;
  status: TeamMemberStatus;
  createdAt: string;
  updatedAt: string;
};

type MembershipIndexDocument = {
  id: string;
  membershipId: string;
  sourceTeamMemberId: string;
  teamId: string;
  userId: string;
  playerId: string | null;
  role: TeamMemberRole | null;
  roles: TeamMemberRole[];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  joinedAt: string;
  status: TeamMemberStatus;
  createdAt: string;
  updatedAt: string;
};

type NormalizedUserDocument = {
  id: string;
  ref: DocumentReference;
  exists: boolean;
  activeTeamId: string | null;
  updatedAt: string | null;
};

type PlannedWrite = {
  kind: 'teamMember' | 'player' | 'teamMembershipIndex' | 'user';
  action: 'create' | 'update';
  ref: DocumentReference;
  data: DocumentData;
  merge?: SetOptions;
};

type CaseAction = 'create' | 'update' | 'link' | 'unchanged' | 'skipped';

type RepairCaseReport = {
  playerId: string;
  teamId: string;
  linkedEmail: string;
  authUserId: string | null;
  teamMemberAction: CaseAction;
  playerAction: CaseAction;
  indexAction: CaseAction;
  userAction: CaseAction;
  reason: string | null;
  notes: string[];
};

type SuccessfulRepairCase = {
  report: RepairCaseReport;
  authUser: UserRecord;
  player: NormalizedPlayer;
  finalMembership: NormalizedTeamMember;
};

type Summary = {
  mode: 'dry-run' | 'write';
  projectId: string | null;
  credentialsPath: string | null;
  playersRead: number;
  candidatePlayers: number;
  authLookups: number;
  authUsersFound: number;
  teamMembersCreated: number;
  teamMembersUpdated: number;
  teamMembersUnchanged: number;
  teamMembershipIndexesCreated: number;
  teamMembershipIndexesUpdated: number;
  teamMembershipIndexesUnchanged: number;
  playersLinked: number;
  playersAlreadyLinked: number;
  activeTeamIdFixed: number;
  skippedCases: number;
  noopCases: number;
  skippedReasons: Record<string, number>;
  cases: RepairCaseReport[];
};

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

const READ_PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 350;
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  'secrets',
  'bocaiuva-app-firebase-service-account.json',
);

function log(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(`[repair-players-linked-email] ${message}`);
    return;
  }

  console.log(
    `[repair-players-linked-email] ${message}`,
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
  );
}

function parseDotEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return {} as Record<string, string>;
  }

  const fileContents = readFileSync(filePath, 'utf8');
  const entries: Record<string, string> = {};

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(email: unknown) {
  return normalizeString(email)?.toLowerCase() ?? '';
}

function normalizeTimestampString(value: unknown, fallback: string) {
  return normalizeString(value) ?? fallback;
}

function normalizeTeamMemberStatus(status: unknown): TeamMemberStatus {
  const normalizedStatus = normalizeString(status)?.toLowerCase() ?? '';

  if (ACTIVE_TEAM_MEMBER_STATUSES.has(normalizedStatus)) {
    return 'active';
  }

  if (INACTIVE_TEAM_MEMBER_STATUSES.has(normalizedStatus)) {
    return 'inactive';
  }

  return 'active';
}

function uniqueRoles(roles: TeamMemberRole[]) {
  return [...new Set(roles)];
}

function normalizeRoles(
  rawRoles: unknown,
  input: {
    canManageTeam: boolean;
    canManagePlayers: boolean;
    playerId: string | null;
  },
) {
  const roles = Array.isArray(rawRoles)
    ? rawRoles.filter(
        (role): role is TeamMemberRole => role === 'admin' || role === 'player',
      )
    : [];

  const normalizedRoles = uniqueRoles(roles);
  const isAdmin = input.canManageTeam || normalizedRoles.includes('admin');
  const isPlayer = input.playerId != null || normalizedRoles.includes('player');

  if (isAdmin && !normalizedRoles.includes('admin')) {
    normalizedRoles.unshift('admin');
  }

  if ((isPlayer || normalizedRoles.length === 0) && !normalizedRoles.includes('player')) {
    normalizedRoles.push('player');
  }

  return uniqueRoles(normalizedRoles);
}

function normalizePrimaryRole(roles: TeamMemberRole[]) {
  if (roles.includes('admin')) {
    return 'admin' as const;
  }

  if (roles.includes('player')) {
    return 'player' as const;
  }

  return null;
}

function parseArguments(argv: string[], fileEnv: Record<string, string>): RepairOptions {
  let dryRun = false;
  let credentialsPath: string | null = null;
  let projectId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      console.log(
        [
          'Usage: node --experimental-strip-types ./scripts/repair-players-linked-email.ts [--dry-run] [--credentials path] [--project-id value]',
          '',
          'Credential resolution order:',
          '1. --credentials',
          '2. FIREBASE_SERVICE_ACCOUNT_PATH',
          '3. GOOGLE_APPLICATION_CREDENTIALS',
          '4. secrets/bocaiuva-app-firebase-service-account.json',
          '5. Application Default Credentials',
        ].join('\n'),
      );
      process.exit(0);
    }

    if (argument === '--credentials') {
      credentialsPath = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }

    if (argument.startsWith('--credentials=')) {
      credentialsPath = path.resolve(argument.slice('--credentials='.length));
      continue;
    }

    if (argument === '--project-id') {
      projectId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (argument.startsWith('--project-id=')) {
      projectId = argument.slice('--project-id='.length);
    }
  }

  const envCredentialsPath =
    normalizeString(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    normalizeString(process.env.GOOGLE_APPLICATION_CREDENTIALS) ??
    normalizeString(fileEnv.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    normalizeString(fileEnv.GOOGLE_APPLICATION_CREDENTIALS);
  const resolvedCredentialsPath = credentialsPath
    ? path.resolve(credentialsPath)
    : envCredentialsPath
      ? path.resolve(envCredentialsPath)
      : existsSync(DEFAULT_SERVICE_ACCOUNT_PATH)
        ? DEFAULT_SERVICE_ACCOUNT_PATH
        : null;

  const resolvedProjectId =
    projectId ??
    normalizeString(process.env.FIREBASE_PROJECT_ID) ??
    normalizeString(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ??
    normalizeString(process.env.GCLOUD_PROJECT) ??
    normalizeString(fileEnv.FIREBASE_PROJECT_ID) ??
    normalizeString(fileEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID);

  return {
    dryRun,
    credentialsPath: resolvedCredentialsPath,
    projectId: resolvedProjectId,
  };
}

function initializeFirestore(options: RepairOptions) {
  if (getApps().length > 0) {
    return {
      firestore: getFirestore(getApps()[0]),
      auth: getAuth(getApps()[0]),
    };
  }

  if (options.credentialsPath) {
    if (!existsSync(options.credentialsPath)) {
      throw new Error(
        `Arquivo de credencial nao encontrado em ${options.credentialsPath}.`,
      );
    }

    const serviceAccount = JSON.parse(
      readFileSync(options.credentialsPath, 'utf8'),
    ) as ServiceAccount & { project_id?: string };
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: options.projectId ?? serviceAccount.project_id,
    });

    return {
      firestore: getFirestore(app),
      auth: getAuth(app),
    };
  }

  const app = initializeApp({
    credential: applicationDefault(),
    ...(options.projectId ? { projectId: options.projectId } : {}),
  });

  return {
    firestore: getFirestore(app),
    auth: getAuth(app),
  };
}

function membershipKey(userId: string, teamId: string) {
  return `${userId}__${teamId}`;
}

function playerEmailKey(teamId: string, normalizedEmail: string) {
  return `${teamId}__${normalizedEmail}`;
}

function isPlayerAvailable(player: Pick<NormalizedPlayer, 'status' | 'deletedAt'>) {
  return player.status !== 'inactive' && !player.deletedAt;
}

function normalizePlayerDocument(
  snapshot: DocumentData & { id: string; ref: DocumentReference },
  now: string,
) {
  const teamId = normalizeString(snapshot.teamId);
  if (!teamId) {
    return null;
  }

  const linkedEmail = normalizeString(snapshot.linkedEmail);
  const normalizedLinkedEmail = normalizeEmail(snapshot.linkedEmail);

  return {
    id: snapshot.id,
    ref: snapshot.ref,
    teamId,
    linkedEmail,
    normalizedLinkedEmail,
    linkedUserId: normalizeString(snapshot.linkedUserId),
    status: normalizeString(snapshot.status),
    deletedAt: normalizeString(snapshot.deletedAt),
    createdAt: normalizeTimestampString(snapshot.createdAt, now),
    updatedAt: normalizeTimestampString(snapshot.updatedAt, now),
  } satisfies NormalizedPlayer;
}

function normalizeTeamMemberDocument(
  snapshot: DocumentData & { id: string; ref: DocumentReference },
  now: string,
) {
  const userId = normalizeString(snapshot.userId);
  const teamId = normalizeString(snapshot.teamId);

  if (!userId || !teamId) {
    return null;
  }

  const playerId = normalizeString(snapshot.playerId);
  const canManageTeam = snapshot.canManageTeam === true;
  const canManagePlayers = snapshot.canManagePlayers === true || canManageTeam;
  const roles = normalizeRoles(snapshot.roles, {
    canManageTeam,
    canManagePlayers,
    playerId,
  });
  const createdAt = normalizeTimestampString(snapshot.createdAt, now);
  const updatedAt = normalizeTimestampString(snapshot.updatedAt, createdAt);
  const joinedAt = normalizeTimestampString(snapshot.joinedAt, createdAt);

  return {
    id: snapshot.id,
    ref: snapshot.ref,
    userId,
    teamId,
    playerId,
    inviteCodeUsed: normalizeString(snapshot.inviteCodeUsed),
    roles,
    canManageTeam: canManageTeam || roles.includes('admin'),
    canManagePlayers: canManagePlayers || roles.includes('admin'),
    joinedAt,
    status: normalizeTeamMemberStatus(snapshot.status),
    createdAt,
    updatedAt,
  } satisfies NormalizedTeamMember;
}

function buildTeamMemberDocument(input: {
  id: string;
  ref: DocumentReference;
  userId: string;
  teamId: string;
  playerId: string | null;
  inviteCodeUsed?: string | null;
  roles: TeamMemberRole[];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  createdAt: string;
  updatedAt: string;
  joinedAt?: string;
  status?: TeamMemberStatus;
}) {
  const roles = normalizeRoles(input.roles, {
    canManageTeam: input.canManageTeam,
    canManagePlayers: input.canManagePlayers,
    playerId: input.playerId,
  });

  return {
    id: input.id,
    ref: input.ref,
    userId: input.userId,
    teamId: input.teamId,
    playerId: input.playerId,
    inviteCodeUsed: input.inviteCodeUsed ?? null,
    roles,
    canManageTeam: input.canManageTeam || roles.includes('admin'),
    canManagePlayers: input.canManagePlayers || roles.includes('admin'),
    joinedAt: input.joinedAt ?? input.createdAt,
    status: input.status ?? 'active',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  } satisfies NormalizedTeamMember;
}

function buildTeamMembershipIndexDocument(
  membership: NormalizedTeamMember,
  existing?: Record<string, unknown>,
) {
  const createdAt = normalizeTimestampString(existing?.createdAt, membership.createdAt);

  return {
    id: membership.userId,
    membershipId: membership.id,
    sourceTeamMemberId: membership.id,
    teamId: membership.teamId,
    userId: membership.userId,
    playerId: membership.playerId,
    role: normalizePrimaryRole(membership.roles),
    roles: membership.roles,
    canManageTeam: membership.canManageTeam,
    canManagePlayers: membership.canManagePlayers,
    joinedAt: membership.joinedAt,
    status: membership.status,
    createdAt,
    updatedAt: membership.updatedAt,
  } satisfies MembershipIndexDocument;
}

function comparableIndexDocument(
  document: Record<string, unknown> | MembershipIndexDocument | null,
) {
  if (!document) {
    return null;
  }

  const roles = Array.isArray(document.roles)
    ? uniqueRoles(
        document.roles.filter(
          (role): role is TeamMemberRole => role === 'admin' || role === 'player',
        ),
      )
    : [];

  return {
    id: normalizeString(document.id) ?? null,
    membershipId: normalizeString(document.membershipId) ?? null,
    sourceTeamMemberId:
      normalizeString(document.sourceTeamMemberId) ??
      normalizeString(document.membershipId) ??
      null,
    teamId: normalizeString(document.teamId) ?? null,
    userId: normalizeString(document.userId) ?? null,
    playerId: normalizeString(document.playerId),
    role:
      document.role === 'admin' || document.role === 'player'
        ? document.role
        : null,
    roles,
    canManageTeam: document.canManageTeam === true,
    canManagePlayers: document.canManagePlayers === true,
    joinedAt: normalizeString(document.joinedAt) ?? null,
    status: normalizeTeamMemberStatus(document.status),
    createdAt: normalizeString(document.createdAt) ?? null,
    updatedAt: normalizeString(document.updatedAt) ?? null,
  };
}

function markCaseSkipped(summary: Summary, report: RepairCaseReport, reason: string, note?: string) {
  report.teamMemberAction = 'skipped';
  report.playerAction = 'skipped';
  report.indexAction = 'skipped';
  report.userAction = 'skipped';
  report.reason = reason;
  if (note) {
    report.notes.push(note);
  }

  summary.skippedCases += 1;
  summary.skippedReasons[reason] = (summary.skippedReasons[reason] ?? 0) + 1;
}

async function readPlayers(
  firestore: Firestore,
  summary: Summary,
) {
  const now = new Date().toISOString();
  const repairCandidates: NormalizedPlayer[] = [];
  const activePlayersByTeam = new Map<string, NormalizedPlayer[]>();
  let lastDocumentId: string | null = null;

  while (true) {
    let queryRef = firestore
      .collection('players')
      .orderBy(FieldPath.documentId())
      .limit(READ_PAGE_SIZE);

    if (lastDocumentId) {
      queryRef = queryRef.startAfter(lastDocumentId);
    }

    const snapshot = await queryRef.get();
    if (snapshot.empty) {
      break;
    }

    for (const document of snapshot.docs) {
      summary.playersRead += 1;
      const player = normalizePlayerDocument(
        {
          id: document.id,
          ref: document.ref,
          ...(document.data() as Omit<RawPlayerDocument, 'id'>),
        },
        now,
      );

      if (!player || !isPlayerAvailable(player)) {
        continue;
      }

      const teamPlayers = activePlayersByTeam.get(player.teamId) ?? [];
      activePlayersByTeam.set(player.teamId, [...teamPlayers, player]);

      if (!player.normalizedLinkedEmail) {
        continue;
      }

      repairCandidates.push(player);
    }

    lastDocumentId = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
    if (snapshot.size < READ_PAGE_SIZE) {
      break;
    }
  }

  summary.candidatePlayers = repairCandidates.length;
  return {
    repairCandidates,
    activePlayersByTeam,
  };
}

async function readActiveTeamMembers(firestore: Firestore) {
  const now = new Date().toISOString();
  const membershipsByUserTeam = new Map<string, NormalizedTeamMember[]>();
  const membershipsByUser = new Map<string, NormalizedTeamMember[]>();
  let lastDocumentId: string | null = null;

  while (true) {
    let queryRef = firestore
      .collection('teamMembers')
      .orderBy(FieldPath.documentId())
      .limit(READ_PAGE_SIZE);

    if (lastDocumentId) {
      queryRef = queryRef.startAfter(lastDocumentId);
    }

    const snapshot = await queryRef.get();
    if (snapshot.empty) {
      break;
    }

    for (const document of snapshot.docs) {
      const membership = normalizeTeamMemberDocument(
        {
          id: document.id,
          ref: document.ref,
          ...(document.data() as Omit<RawTeamMemberDocument, 'id'>),
        },
        now,
      );

      if (!membership || membership.status !== 'active') {
        continue;
      }

      const key = membershipKey(membership.userId, membership.teamId);
      membershipsByUserTeam.set(key, [
        ...(membershipsByUserTeam.get(key) ?? []),
        membership,
      ]);
      membershipsByUser.set(membership.userId, [
        ...(membershipsByUser.get(membership.userId) ?? []),
        membership,
      ]);
    }

    lastDocumentId = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
    if (snapshot.size < READ_PAGE_SIZE) {
      break;
    }
  }

  return {
    membershipsByUserTeam,
    membershipsByUser,
  };
}

async function lookupAuthUserByEmail(
  email: string,
  summary: Summary,
  cache: Map<string, UserRecord | null>,
) {
  if (cache.has(email)) {
    return cache.get(email) ?? null;
  }

  summary.authLookups += 1;

  try {
    const user = await getAuth().getUserByEmail(email);
    cache.set(email, user);
    summary.authUsersFound += 1;
    return user;
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;

    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      cache.set(email, null);
      return null;
    }

    throw error;
  }
}

function setProjectedMembership(
  projectedByUserTeam: Map<string, NormalizedTeamMember[]>,
  projectedByUser: Map<string, NormalizedTeamMember[]>,
  membership: NormalizedTeamMember,
) {
  projectedByUserTeam.set(membershipKey(membership.userId, membership.teamId), [membership]);

  const currentByUser = projectedByUser.get(membership.userId) ?? [];
  const nextByUser = [
    ...currentByUser.filter((item) => item.teamId !== membership.teamId),
    membership,
  ];
  projectedByUser.set(membership.userId, nextByUser);
}

function getActiveTeamIdsForUser(
  membershipsByUser: Map<string, NormalizedTeamMember[]>,
  userId: string,
) {
  return [...new Set((membershipsByUser.get(userId) ?? []).map((membership) => membership.teamId))];
}

async function fetchUserDocument(
  firestore: Firestore,
  userId: string,
  cache: Map<string, NormalizedUserDocument>,
) {
  if (cache.has(userId)) {
    return cache.get(userId)!;
  }

  const ref = firestore.collection('users').doc(userId);
  const snapshot = await ref.get();
  const data = snapshot.exists
    ? ({
        id: snapshot.id,
        ...(snapshot.data() as Omit<RawUserDocument, 'id'>),
      } satisfies RawUserDocument)
    : null;

  const userDocument = {
    id: userId,
    ref,
    exists: snapshot.exists,
    activeTeamId: normalizeString(data?.activeTeamId),
    updatedAt: normalizeString(data?.updatedAt),
  } satisfies NormalizedUserDocument;

  cache.set(userId, userDocument);
  return userDocument;
}

async function main() {
  const fileEnv = parseDotEnvFile(path.resolve(process.cwd(), '.env'));
  const options = parseArguments(process.argv.slice(2), fileEnv);
  const summary: Summary = {
    mode: options.dryRun ? 'dry-run' : 'write',
    projectId: options.projectId,
    credentialsPath: options.credentialsPath,
    playersRead: 0,
    candidatePlayers: 0,
    authLookups: 0,
    authUsersFound: 0,
    teamMembersCreated: 0,
    teamMembersUpdated: 0,
    teamMembersUnchanged: 0,
    teamMembershipIndexesCreated: 0,
    teamMembershipIndexesUpdated: 0,
    teamMembershipIndexesUnchanged: 0,
    playersLinked: 0,
    playersAlreadyLinked: 0,
    activeTeamIdFixed: 0,
    skippedCases: 0,
    noopCases: 0,
    skippedReasons: {},
    cases: [],
  };

  log('start', {
    mode: summary.mode,
    projectId: summary.projectId ?? 'auto',
    credentialsPath: summary.credentialsPath ?? 'application-default',
  });

  const { firestore } = initializeFirestore(options);
  const { repairCandidates, activePlayersByTeam } = await readPlayers(firestore, summary);
  const { membershipsByUserTeam, membershipsByUser } = await readActiveTeamMembers(firestore);
  const projectedMembershipsByUserTeam = new Map(membershipsByUserTeam);
  const projectedMembershipsByUser = new Map(membershipsByUser);
  const authCache = new Map<string, UserRecord | null>();
  const userDocCache = new Map<string, NormalizedUserDocument>();
  const plannedWrites: PlannedWrite[] = [];
  const successfulCases: SuccessfulRepairCase[] = [];
  const candidateGroups = new Map<string, NormalizedPlayer[]>();

  for (const candidate of repairCandidates) {
    const key = playerEmailKey(candidate.teamId, candidate.normalizedLinkedEmail);
    candidateGroups.set(key, [...(candidateGroups.get(key) ?? []), candidate]);
  }

  for (const candidate of repairCandidates) {
    const report: RepairCaseReport = {
      playerId: candidate.id,
      teamId: candidate.teamId,
      linkedEmail: candidate.normalizedLinkedEmail,
      authUserId: null,
      teamMemberAction: 'unchanged',
      playerAction: 'unchanged',
      indexAction: 'unchanged',
      userAction: 'unchanged',
      reason: null,
      notes: [],
    };
    summary.cases.push(report);

    const group = candidateGroups.get(
      playerEmailKey(candidate.teamId, candidate.normalizedLinkedEmail),
    ) ?? [];

    if (group.length > 1) {
      markCaseSkipped(
        summary,
        report,
        'multiple-active-players-share-linked-email-in-team',
        `Jogadores conflitantes: ${group.map((item) => item.id).join(', ')}`,
      );
      continue;
    }

    const authUser = await lookupAuthUserByEmail(
      candidate.normalizedLinkedEmail,
      summary,
      authCache,
    );

    if (!authUser) {
      markCaseSkipped(
        summary,
        report,
        'auth-user-not-found-by-linked-email',
        'Nenhum usuario do Firebase Auth foi encontrado para esse linkedEmail.',
      );
      continue;
    }

    report.authUserId = authUser.uid;

    if (candidate.linkedUserId && candidate.linkedUserId !== authUser.uid) {
      markCaseSkipped(
        summary,
        report,
        'player-linked-user-conflict',
        `O player ja aponta para outro uid: ${candidate.linkedUserId}.`,
      );
      continue;
    }

    const otherLinkedPlayers = (activePlayersByTeam.get(candidate.teamId) ?? []).filter(
      (player) => player.id !== candidate.id && player.linkedUserId === authUser.uid,
    );

    if (otherLinkedPlayers.length > 0) {
      markCaseSkipped(
        summary,
        report,
        'user-already-linked-to-another-player-in-team',
        `Outro jogador ativo do time ja esta vinculado ao uid: ${otherLinkedPlayers
          .map((player) => player.id)
          .join(', ')}.`,
      );
      continue;
    }

    const key = membershipKey(authUser.uid, candidate.teamId);
    const existingMemberships = projectedMembershipsByUserTeam.get(key) ?? [];

    if (existingMemberships.length > 1) {
      markCaseSkipped(
        summary,
        report,
        'multiple-active-team-members-for-user-team',
        `Memberships ativas conflitantes: ${existingMemberships
          .map((membership) => membership.id)
          .join(', ')}.`,
      );
      continue;
    }

    const updatedAt = new Date().toISOString();
    let finalMembership: NormalizedTeamMember;

    if (existingMemberships.length === 0) {
      const ref = firestore.collection('teamMembers').doc();
      finalMembership = buildTeamMemberDocument({
        id: ref.id,
        ref,
        userId: authUser.uid,
        teamId: candidate.teamId,
        playerId: candidate.id,
        inviteCodeUsed: null,
        roles: ['player'],
        canManageTeam: false,
        canManagePlayers: false,
        createdAt: updatedAt,
        updatedAt,
        joinedAt: updatedAt,
        status: 'active',
      });
      plannedWrites.push({
        kind: 'teamMember',
        action: 'create',
        ref,
        data: {
          id: finalMembership.id,
          userId: finalMembership.userId,
          teamId: finalMembership.teamId,
          playerId: finalMembership.playerId,
          inviteCodeUsed: finalMembership.inviteCodeUsed,
          roles: finalMembership.roles,
          canManageTeam: finalMembership.canManageTeam,
          canManagePlayers: finalMembership.canManagePlayers,
          joinedAt: finalMembership.joinedAt,
          status: finalMembership.status,
          createdAt: finalMembership.createdAt,
          updatedAt: finalMembership.updatedAt,
        },
      });
      summary.teamMembersCreated += 1;
      report.teamMemberAction = 'create';
      setProjectedMembership(
        projectedMembershipsByUserTeam,
        projectedMembershipsByUser,
        finalMembership,
      );
    } else {
      const existingMembership = existingMemberships[0]!;

      if (
        existingMembership.playerId &&
        existingMembership.playerId !== candidate.id
      ) {
        markCaseSkipped(
          summary,
          report,
          'user-already-has-different-player-id-in-team',
          `Membership ${existingMembership.id} ja aponta para o player ${existingMembership.playerId}.`,
        );
        continue;
      }

      const nextRoles: TeamMemberRole[] = existingMembership.roles.includes('player')
        ? existingMembership.roles
        : [...existingMembership.roles, 'player'];
      const needsMembershipUpdate =
        existingMembership.playerId !== candidate.id ||
        nextRoles.length !== existingMembership.roles.length;

      if (needsMembershipUpdate) {
        finalMembership = buildTeamMemberDocument({
          id: existingMembership.id,
          ref: existingMembership.ref,
          userId: existingMembership.userId,
          teamId: existingMembership.teamId,
          playerId: candidate.id,
          inviteCodeUsed: existingMembership.inviteCodeUsed,
          roles: nextRoles,
          canManageTeam: existingMembership.canManageTeam,
          canManagePlayers: existingMembership.canManagePlayers,
          createdAt: existingMembership.createdAt,
          updatedAt,
          joinedAt: existingMembership.joinedAt,
          status: 'active',
        });
        plannedWrites.push({
          kind: 'teamMember',
          action: 'update',
          ref: existingMembership.ref,
          data: {
            id: finalMembership.id,
            userId: finalMembership.userId,
            teamId: finalMembership.teamId,
            playerId: finalMembership.playerId,
            inviteCodeUsed: finalMembership.inviteCodeUsed,
            roles: finalMembership.roles,
            canManageTeam: finalMembership.canManageTeam,
            canManagePlayers: finalMembership.canManagePlayers,
            joinedAt: finalMembership.joinedAt,
            status: finalMembership.status,
            createdAt: finalMembership.createdAt,
            updatedAt: finalMembership.updatedAt,
          },
        });
        summary.teamMembersUpdated += 1;
        report.teamMemberAction = 'update';
        setProjectedMembership(
          projectedMembershipsByUserTeam,
          projectedMembershipsByUser,
          finalMembership,
        );
      } else {
        finalMembership = existingMembership;
        summary.teamMembersUnchanged += 1;
        report.teamMemberAction = 'unchanged';
      }
    }

    if (!candidate.linkedUserId) {
      plannedWrites.push({
        kind: 'player',
        action: 'update',
        ref: candidate.ref,
        data: {
          linkedUserId: authUser.uid,
          updatedAt,
        },
        merge: { merge: true },
      });
      summary.playersLinked += 1;
      report.playerAction = 'link';
    } else {
      summary.playersAlreadyLinked += 1;
      report.playerAction = 'unchanged';
    }

    successfulCases.push({
      report,
      authUser,
      player: candidate,
      finalMembership,
    });
  }

  for (let index = 0; index < successfulCases.length; index += WRITE_BATCH_SIZE) {
    const chunk = successfulCases.slice(index, index + WRITE_BATCH_SIZE);
    const refs = chunk.map(({ finalMembership }) =>
      firestore
        .collection('teamMembershipIndex')
        .doc(finalMembership.teamId)
        .collection('members')
        .doc(finalMembership.userId),
    );
    const snapshots = refs.length > 0 ? await firestore.getAll(...refs) : [];

    for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
      const item = chunk[chunkIndex]!;
      const ref = refs[chunkIndex]!;
      const snapshot = snapshots[chunkIndex]!;
      const existingData = snapshot.exists
        ? (snapshot.data() as Record<string, unknown>)
        : undefined;
      const nextDocument = buildTeamMembershipIndexDocument(
        item.finalMembership,
        existingData,
      );
      const comparableExisting = comparableIndexDocument(existingData ?? null);
      const comparableNext = comparableIndexDocument(nextDocument);
      const action = !snapshot.exists
        ? 'create'
        : JSON.stringify(comparableExisting) === JSON.stringify(comparableNext)
          ? 'unchanged'
          : 'update';

      if (action === 'create') {
        summary.teamMembershipIndexesCreated += 1;
        item.report.indexAction = 'create';
        plannedWrites.push({
          kind: 'teamMembershipIndex',
          action,
          ref,
          data: nextDocument,
          merge: { merge: true },
        });
      } else if (action === 'update') {
        summary.teamMembershipIndexesUpdated += 1;
        item.report.indexAction = 'update';
        plannedWrites.push({
          kind: 'teamMembershipIndex',
          action,
          ref,
          data: nextDocument,
          merge: { merge: true },
        });
      } else {
        summary.teamMembershipIndexesUnchanged += 1;
        item.report.indexAction = 'unchanged';
      }
    }
  }

  const casesByUserId = new Map<string, SuccessfulRepairCase[]>();
  for (const item of successfulCases) {
    casesByUserId.set(item.authUser.uid, [
      ...(casesByUserId.get(item.authUser.uid) ?? []),
      item,
    ]);
  }

  for (const [userId, userCases] of casesByUserId.entries()) {
    const userDocument = await fetchUserDocument(firestore, userId, userDocCache);

    if (!userDocument.exists) {
      for (const item of userCases) {
        item.report.userAction = 'skipped';
        item.report.notes.push('Documento users/{uid} nao encontrado para corrigir activeTeamId.');
      }
      continue;
    }

    if (userDocument.activeTeamId) {
      for (const item of userCases) {
        item.report.userAction = 'unchanged';
      }
      continue;
    }

    const activeTeamIds = getActiveTeamIdsForUser(projectedMembershipsByUser, userId);
    if (activeTeamIds.length !== 1) {
      for (const item of userCases) {
        item.report.userAction = 'skipped';
        item.report.notes.push(
          activeTeamIds.length === 0
            ? 'Nenhuma membership ativa restou para definir activeTeamId.'
            : `Usuario possui mais de um time ativo (${activeTeamIds.join(', ')}).`,
        );
      }
      continue;
    }

    const targetTeamId = activeTeamIds[0]!;
    const targetCase =
      userCases.find((item) => item.finalMembership.teamId === targetTeamId) ?? userCases[0]!;
    const updatedAt = new Date().toISOString();
    plannedWrites.push({
      kind: 'user',
      action: 'update',
      ref: userDocument.ref,
      data: {
        activeTeamId: targetTeamId,
        updatedAt,
      },
      merge: { merge: true },
    });
    summary.activeTeamIdFixed += 1;
    targetCase.report.userAction = 'update';

    for (const item of userCases) {
      if (item !== targetCase) {
        item.report.userAction = 'unchanged';
      }
    }

    userDocCache.set(userId, {
      ...userDocument,
      activeTeamId: targetTeamId,
      updatedAt,
    });
  }

  for (const report of summary.cases) {
    if (
      report.reason == null &&
      report.teamMemberAction === 'unchanged' &&
      report.playerAction === 'unchanged' &&
      report.indexAction === 'unchanged' &&
      report.userAction === 'unchanged'
    ) {
      summary.noopCases += 1;
    }
  }

  for (const write of plannedWrites) {
    log(options.dryRun ? 'plan-write' : 'write', {
      kind: write.kind,
      action: write.action,
      path: write.ref.path,
    });
  }

  if (!options.dryRun) {
    for (let index = 0; index < plannedWrites.length; index += WRITE_BATCH_SIZE) {
      const batch = firestore.batch();
      const chunk = plannedWrites.slice(index, index + WRITE_BATCH_SIZE);

      for (const write of chunk) {
        if (write.merge) {
          batch.set(write.ref, write.data, write.merge);
          continue;
        }

        batch.set(write.ref, write.data);
      }

      await batch.commit();
    }
  }

  log('summary', summary);
}

main().catch((error) => {
  console.error(
    '[repair-players-linked-email] failed',
    error instanceof Error
      ? JSON.stringify(
          {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          null,
          2,
        )
      : error,
  );
  process.exitCode = 1;
});

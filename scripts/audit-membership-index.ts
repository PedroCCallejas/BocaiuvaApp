import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import {
  FieldPath,
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';

type TeamMemberRole = 'admin' | 'player';
type TeamMemberStatus = 'active' | 'inactive';

type RawTeamMemberDocument = {
  id: string;
  teamId?: unknown;
  userId?: unknown;
  playerId?: unknown;
  roles?: unknown;
  canManageTeam?: unknown;
  canManagePlayers?: unknown;
  joinedAt?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type RawIndexMemberDocument = {
  id: string;
  membershipId?: unknown;
  sourceTeamMemberId?: unknown;
  teamId?: unknown;
  userId?: unknown;
  playerId?: unknown;
  role?: unknown;
  roles?: unknown;
  canManageTeam?: unknown;
  canManagePlayers?: unknown;
  joinedAt?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type CandidateMembership = {
  sourceTeamMemberId: string;
  teamId: string;
  userId: string;
  playerId: string | null;
  role: TeamMemberRole | null;
  roles: TeamMemberRole[];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
};

type IndexMember = {
  id: string;
  path: string;
  parentPath: string;
  teamId: string;
  userId: string;
  playerId: string | null;
  membershipId: string | null;
  sourceTeamMemberId: string | null;
  role: TeamMemberRole | null;
  roles: TeamMemberRole[];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  joinedAt: string | null;
  status: TeamMemberStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

type AuditOptions = {
  credentialsPath: string | null;
  projectId: string | null;
};

type AuditSummary = {
  rootTeamMembershipIndexDocs: number;
  memberIndexDocs: number;
  activeTeamMemberDocs: number;
  uniqueActiveMembershipTargets: number;
  duplicateActiveMembershipTargets: number;
  missingIndexesForActiveTeamMembers: Array<{
    teamId: string;
    userId: string;
    sourceTeamMemberId: string;
    targetMemberPath: string;
  }>;
  indexesWithoutActiveTeamMember: Array<{
    teamId: string;
    userId: string;
    sourceTeamMemberId: string | null;
    targetMemberPath: string;
    reason: 'missing-team-member' | 'source-team-member-mismatch';
  }>;
  duplicateActiveMemberships: Array<{
    teamId: string;
    userId: string;
    teamMemberIds: string[];
  }>;
  specificChecks: Array<Record<string, unknown>>;
};

type IndexWithoutActiveTeamMember = {
  teamId: string;
  userId: string;
  sourceTeamMemberId: string | null;
  targetMemberPath: string;
  reason: 'missing-team-member' | 'source-team-member-mismatch';
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
const INDEX_ROOT_COLLECTION = 'teamMembershipIndex';
const INDEX_MEMBERS_SUBCOLLECTION = 'members';
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  'secrets',
  'bocaiuva-app-firebase-service-account.json',
);
const SPECIFIC_TEAM_ID = 'vqzvTl6UPINSmpHgolGF';
const SPECIFIC_USER_IDS = [
  'Nsp6WknOsHcXpOKQ7uaMB3aZMM52',
  'V6X1147dWUX7iB3ozG5Dgt4sTI53',
] as const;

function log(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(`[membership-index-audit] ${message}`);
    return;
  }

  console.log(
    `[membership-index-audit] ${message}`,
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
  const normalizedRoles = Array.isArray(rawRoles)
    ? rawRoles.filter(
        (role): role is TeamMemberRole => role === 'admin' || role === 'player',
      )
    : [];

  const roles = uniqueRoles(normalizedRoles);
  const isAdmin = input.canManageTeam || roles.includes('admin');
  const isPlayer = roles.includes('player') || input.playerId != null;

  if (isAdmin && !roles.includes('admin')) {
    roles.unshift('admin');
  }

  if ((isPlayer || roles.length === 0) && !roles.includes('player')) {
    roles.push('player');
  }

  return uniqueRoles(roles);
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

function membershipPriority(candidate: CandidateMembership) {
  return (
    candidate.roles.length * 1_000 +
    (candidate.canManageTeam ? 100 : 0) +
    (candidate.canManagePlayers ? 50 : 0) +
    (candidate.playerId ? 25 : 0) +
    new Date(candidate.updatedAt).getTime() / 1_000_000_000_000
  );
}

function compareCandidates(left: CandidateMembership, right: CandidateMembership) {
  const leftPriority = membershipPriority(left);
  const rightPriority = membershipPriority(right);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.sourceTeamMemberId.localeCompare(right.sourceTeamMemberId);
}

function parseArguments(argv: string[], fileEnv: Record<string, string>): AuditOptions {
  let credentialsPath: string | null = null;
  let projectId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      console.log(
        [
          'Usage: node --experimental-strip-types ./scripts/audit-membership-index.ts [--credentials path] [--project-id value]',
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
    credentialsPath ??
    normalizeString(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    normalizeString(process.env.GOOGLE_APPLICATION_CREDENTIALS) ??
    normalizeString(fileEnv.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    normalizeString(fileEnv.GOOGLE_APPLICATION_CREDENTIALS);
  const resolvedCredentialsPath = envCredentialsPath
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
    credentialsPath: resolvedCredentialsPath,
    projectId: resolvedProjectId,
  };
}

function initializeFirestore(options: AuditOptions) {
  if (getApps().length > 0) {
    return getFirestore(getApps()[0]);
  }

  if (options.credentialsPath) {
    if (!existsSync(options.credentialsPath)) {
      throw new Error(`Arquivo de credencial nao encontrado em ${options.credentialsPath}.`);
    }

    const serviceAccount = JSON.parse(
      readFileSync(options.credentialsPath, 'utf8'),
    ) as ServiceAccount & { project_id?: string };
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: options.projectId ?? serviceAccount.project_id,
    });
    return getFirestore(app);
  }

  const app = initializeApp({
    credential: applicationDefault(),
    ...(options.projectId ? { projectId: options.projectId } : {}),
  });

  return getFirestore(app);
}

function validateMembershipDocument(raw: RawTeamMemberDocument): CandidateMembership | null {
  const now = new Date().toISOString();
  const teamId = normalizeString(raw.teamId);
  const userId = normalizeString(raw.userId);

  if (!teamId || !userId) {
    return null;
  }

  if (normalizeTeamMemberStatus(raw.status) !== 'active') {
    return null;
  }

  const playerId = normalizeString(raw.playerId);
  const canManageTeam = raw.canManageTeam === true;
  const canManagePlayers = raw.canManagePlayers === true || canManageTeam;
  const roles = normalizeRoles(raw.roles, {
    canManageTeam,
    canManagePlayers,
    playerId,
  });

  const createdAt = normalizeTimestampString(raw.createdAt, now);
  const updatedAt = normalizeTimestampString(raw.updatedAt, createdAt);
  const joinedAt = normalizeTimestampString(raw.joinedAt, createdAt);

  return {
    sourceTeamMemberId: raw.id,
    teamId,
    userId,
    playerId,
    role: normalizePrimaryRole(roles),
    roles,
    canManageTeam: canManageTeam || roles.includes('admin'),
    canManagePlayers: canManagePlayers || roles.includes('admin'),
    joinedAt,
    createdAt,
    updatedAt,
  };
}

function buildMembershipKey(teamId: string, userId: string) {
  return `${teamId}__${userId}`;
}

function normalizeIndexMemberDocument(
  ref: DocumentReference,
  raw: RawIndexMemberDocument,
) {
  const teamId =
    ref.parent.parent?.id ??
    normalizeString(raw.teamId);
  const userId = normalizeString(raw.userId) ?? ref.id;

  if (!teamId || !userId) {
    return null;
  }

  const playerId = normalizeString(raw.playerId);
  const roles = normalizeRoles(raw.roles, {
    canManageTeam: raw.canManageTeam === true,
    canManagePlayers: raw.canManagePlayers === true || raw.canManageTeam === true,
    playerId,
  });

  return {
    id: ref.id,
    path: ref.path,
    parentPath: ref.parent.parent?.path ?? `${INDEX_ROOT_COLLECTION}/${teamId}`,
    teamId,
    userId,
    playerId,
    membershipId: normalizeString(raw.membershipId),
    sourceTeamMemberId:
      normalizeString(raw.sourceTeamMemberId) ?? normalizeString(raw.membershipId),
    role:
      raw.role === 'admin' || raw.role === 'player'
        ? raw.role
        : normalizePrimaryRole(roles),
    roles,
    canManageTeam: raw.canManageTeam === true || roles.includes('admin'),
    canManagePlayers: raw.canManagePlayers === true || roles.includes('admin'),
    joinedAt: normalizeString(raw.joinedAt),
    status: normalizeTeamMemberStatus(raw.status),
    createdAt: normalizeString(raw.createdAt),
    updatedAt: normalizeString(raw.updatedAt),
  } satisfies IndexMember;
}

async function readActiveMemberships(firestore: Firestore) {
  const groupedByKey = new Map<string, CandidateMembership>();
  const duplicateMemberships = new Map<string, CandidateMembership[]>();
  let activeTeamMemberDocs = 0;
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
      const membership = validateMembershipDocument({
        id: document.id,
        ...(document.data() as Omit<RawTeamMemberDocument, 'id'>),
      });

      if (!membership) {
        continue;
      }

      activeTeamMemberDocs += 1;
      const key = buildMembershipKey(membership.teamId, membership.userId);
      const previous = groupedByKey.get(key);

      if (!previous) {
        groupedByKey.set(key, membership);
        duplicateMemberships.set(key, [membership]);
        continue;
      }

      duplicateMemberships.set(key, [...(duplicateMemberships.get(key) ?? []), membership]);

      if (compareCandidates(membership, previous) > 0) {
        groupedByKey.set(key, membership);
      }
    }

    lastDocumentId = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
    if (snapshot.size < READ_PAGE_SIZE) {
      break;
    }
  }

  return {
    activeTeamMemberDocs,
    groupedByKey,
    duplicateMemberships: [...duplicateMemberships.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => {
        const [teamId, userId] = key.split('__');
        return {
          teamId: teamId ?? '',
          userId: userId ?? '',
          teamMemberIds: items.map((item) => item.sourceTeamMemberId),
        };
      }),
  };
}

async function readIndexMembers(firestore: Firestore) {
  const groupedByKey = new Map<string, IndexMember>();
  let lastSnapshot: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let memberIndexDocs = 0;

  while (true) {
    let queryRef = firestore
      .collectionGroup(INDEX_MEMBERS_SUBCOLLECTION)
      .orderBy(FieldPath.documentId())
      .limit(READ_PAGE_SIZE);

    if (lastSnapshot) {
      queryRef = queryRef.startAfter(lastSnapshot);
    }

    const snapshot = await queryRef.get();
    if (snapshot.empty) {
      break;
    }

    for (const document of snapshot.docs) {
      const member = normalizeIndexMemberDocument(
        document.ref,
        {
          id: document.id,
          ...(document.data() as Omit<RawIndexMemberDocument, 'id'>),
        },
      );

      if (!member) {
        continue;
      }

      memberIndexDocs += 1;
      groupedByKey.set(buildMembershipKey(member.teamId, member.userId), member);
    }

    lastSnapshot = snapshot.docs[snapshot.docs.length - 1] ?? null;
    if (snapshot.size < READ_PAGE_SIZE) {
      break;
    }
  }

  return {
    memberIndexDocs,
    groupedByKey,
  };
}

async function readParentDocCount(firestore: Firestore) {
  let rootTeamMembershipIndexDocs = 0;
  let lastDocumentId: string | null = null;

  while (true) {
    let queryRef = firestore
      .collection(INDEX_ROOT_COLLECTION)
      .orderBy(FieldPath.documentId())
      .limit(READ_PAGE_SIZE);

    if (lastDocumentId) {
      queryRef = queryRef.startAfter(lastDocumentId);
    }

    const snapshot = await queryRef.get();
    if (snapshot.empty) {
      break;
    }

    rootTeamMembershipIndexDocs += snapshot.size;
    lastDocumentId = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
    if (snapshot.size < READ_PAGE_SIZE) {
      break;
    }
  }

  return rootTeamMembershipIndexDocs;
}

async function runSpecificChecks(
  firestore: Firestore,
  activeMembershipsByKey: Map<string, CandidateMembership>,
) {
  const checks: Record<string, unknown>[] = [];

  const parentRef = firestore.collection(INDEX_ROOT_COLLECTION).doc(SPECIFIC_TEAM_ID);
  const parentSnapshot = await parentRef.get();
  checks.push({
    kind: 'parent-path',
    path: parentRef.path,
    exists: parentSnapshot.exists,
  });

  for (const userId of SPECIFIC_USER_IDS) {
    const memberRef = parentRef.collection(INDEX_MEMBERS_SUBCOLLECTION).doc(userId);
    const memberSnapshot = await memberRef.get();
    const activeMembership = activeMembershipsByKey.get(
      buildMembershipKey(SPECIFIC_TEAM_ID, userId),
    ) ?? null;

    checks.push({
      kind: 'member-path',
      path: memberRef.path,
      exists: memberSnapshot.exists,
      teamMemberStatus: activeMembership ? 'active-team-member-found' : 'missing-team-member-for-user',
      sourceTeamMemberId: activeMembership?.sourceTeamMemberId ?? null,
      teamId: SPECIFIC_TEAM_ID,
      userId,
    });
  }

  return checks;
}

async function main() {
  const fileEnv = parseDotEnvFile(path.resolve(process.cwd(), '.env'));
  const options = parseArguments(process.argv.slice(2), fileEnv);

  log('start', {
    projectId: options.projectId ?? 'auto',
    credentialsPath: options.credentialsPath ?? 'application-default',
  });

  const firestore = initializeFirestore(options);
  const [
    rootTeamMembershipIndexDocs,
    { activeTeamMemberDocs, groupedByKey: activeMembershipsByKey, duplicateMemberships },
    { memberIndexDocs, groupedByKey: indexMembersByKey },
  ] = await Promise.all([
    readParentDocCount(firestore),
    readActiveMemberships(firestore),
    readIndexMembers(firestore),
  ]);

  const missingIndexesForActiveTeamMembers = [...activeMembershipsByKey.entries()]
    .filter(([key]) => !indexMembersByKey.has(key))
    .map(([, membership]) => ({
      teamId: membership.teamId,
      userId: membership.userId,
      sourceTeamMemberId: membership.sourceTeamMemberId,
      targetMemberPath:
        `${INDEX_ROOT_COLLECTION}/${membership.teamId}/${INDEX_MEMBERS_SUBCOLLECTION}/${membership.userId}`,
    }));

  const indexesWithoutActiveTeamMember: IndexWithoutActiveTeamMember[] = [];

  for (const [, indexMember] of indexMembersByKey.entries()) {
    const activeMembership = activeMembershipsByKey.get(
      buildMembershipKey(indexMember.teamId, indexMember.userId),
    );

    if (!activeMembership) {
      indexesWithoutActiveTeamMember.push({
        teamId: indexMember.teamId,
        userId: indexMember.userId,
        sourceTeamMemberId: indexMember.sourceTeamMemberId,
        targetMemberPath: indexMember.path,
        reason: 'missing-team-member',
      });
      continue;
    }

    if (
      indexMember.sourceTeamMemberId &&
      indexMember.sourceTeamMemberId !== activeMembership.sourceTeamMemberId
    ) {
      indexesWithoutActiveTeamMember.push({
        teamId: indexMember.teamId,
        userId: indexMember.userId,
        sourceTeamMemberId: indexMember.sourceTeamMemberId,
        targetMemberPath: indexMember.path,
        reason: 'source-team-member-mismatch',
      });
    }
  }

  const summary: AuditSummary = {
    rootTeamMembershipIndexDocs,
    memberIndexDocs,
    activeTeamMemberDocs,
    uniqueActiveMembershipTargets: activeMembershipsByKey.size,
    duplicateActiveMembershipTargets: duplicateMemberships.length,
    missingIndexesForActiveTeamMembers,
    indexesWithoutActiveTeamMember,
    duplicateActiveMemberships: duplicateMemberships,
    specificChecks: await runSpecificChecks(firestore, activeMembershipsByKey),
  };

  log('summary', summary);
}

main().catch((error) => {
  console.error(
    '[membership-index-audit] failed',
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

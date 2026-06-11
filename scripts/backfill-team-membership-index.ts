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
  priority: number;
};

type PlannedMutation = {
  key: string;
  action: 'create' | 'update' | 'unchanged';
  ref: DocumentReference;
  document: MembershipIndexDocument;
  sourceTeamMemberId: string;
};

type BackfillOptions = {
  dryRun: boolean;
  credentialsPath: string | null;
  projectId: string | null;
};

type Summary = {
  totalRead: number;
  totalValid: number;
  totalIgnored: number;
  totalUniqueTargets: number;
  totalCreated: number;
  totalUpdated: number;
  totalUnchanged: number;
  ignoredReasons: Record<string, number>;
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
const WRITE_BATCH_SIZE = 400;
const INDEX_ROOT_COLLECTION = 'teamMembershipIndex';
const INDEX_MEMBERS_SUBCOLLECTION = 'members';

function log(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(`[membership-index-backfill] ${message}`);
    return;
  }

  console.log(
    `[membership-index-backfill] ${message}`,
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
  const normalized = normalizeString(value);
  return normalized ?? fallback;
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

function incrementReason(summary: Summary, reason: string) {
  summary.ignoredReasons[reason] = (summary.ignoredReasons[reason] ?? 0) + 1;
  summary.totalIgnored += 1;
}

function parseArguments(argv: string[], fileEnv: Record<string, string>): BackfillOptions {
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
          'Usage: node --experimental-strip-types ./scripts/backfill-team-membership-index.ts [--dry-run] [--credentials path] [--project-id value]',
          '',
          'Credential resolution order:',
          '1. --credentials',
          '2. FIREBASE_SERVICE_ACCOUNT_PATH',
          '3. GOOGLE_APPLICATION_CREDENTIALS',
          '4. Application Default Credentials',
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

  const resolvedCredentialsPath =
    credentialsPath ??
    normalizeString(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    normalizeString(process.env.GOOGLE_APPLICATION_CREDENTIALS) ??
    normalizeString(fileEnv.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    normalizeString(fileEnv.GOOGLE_APPLICATION_CREDENTIALS);
  const resolvedProjectId =
    projectId ??
    normalizeString(process.env.FIREBASE_PROJECT_ID) ??
    normalizeString(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ??
    normalizeString(process.env.GCLOUD_PROJECT) ??
    normalizeString(fileEnv.FIREBASE_PROJECT_ID) ??
    normalizeString(fileEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID);

  return {
    dryRun,
    credentialsPath: resolvedCredentialsPath ? path.resolve(resolvedCredentialsPath) : null,
    projectId: resolvedProjectId,
  };
}

function initializeFirestore(options: BackfillOptions) {
  if (getApps().length > 0) {
    return getFirestore(getApps()[0]);
  }

  if (options.credentialsPath) {
    if (!existsSync(options.credentialsPath)) {
      throw new Error(
        `Arquivo de credencial não encontrado em ${options.credentialsPath}.`,
      );
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

function validateMembershipDocument(
  raw: RawTeamMemberDocument,
  summary: Summary,
): CandidateMembership | null {
  const now = new Date().toISOString();
  const teamId = normalizeString(raw.teamId);
  if (!teamId) {
    incrementReason(summary, 'missing-teamId');
    return null;
  }

  const userId = normalizeString(raw.userId);
  if (!userId) {
    incrementReason(summary, 'missing-userId');
    return null;
  }

  const status = normalizeTeamMemberStatus(raw.status);
  if (status !== 'active') {
    incrementReason(summary, 'inactive-status');
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
  const role = normalizePrimaryRole(roles);
  const createdAt = normalizeTimestampString(raw.createdAt, now);
  const updatedAt = normalizeTimestampString(raw.updatedAt, createdAt);
  const joinedAt = normalizeTimestampString(raw.joinedAt, createdAt);

  summary.totalValid += 1;

  return {
    sourceTeamMemberId: raw.id,
    teamId,
    userId,
    playerId,
    role,
    roles,
    canManageTeam: canManageTeam || roles.includes('admin'),
    canManagePlayers:
      canManagePlayers || roles.includes('admin'),
    joinedAt,
    createdAt,
    updatedAt,
    priority: 0,
  };
}

function compareCandidates(left: CandidateMembership, right: CandidateMembership) {
  const leftPriority = membershipPriority(left);
  const rightPriority = membershipPriority(right);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.sourceTeamMemberId.localeCompare(right.sourceTeamMemberId);
}

function buildIndexDocument(
  candidate: CandidateMembership,
  existing: Record<string, unknown> | undefined,
) {
  const createdAt = normalizeTimestampString(existing?.createdAt, candidate.createdAt);

  return {
    id: candidate.userId,
    membershipId: candidate.sourceTeamMemberId,
    sourceTeamMemberId: candidate.sourceTeamMemberId,
    teamId: candidate.teamId,
    userId: candidate.userId,
    playerId: candidate.playerId,
    role: candidate.role,
    roles: candidate.roles,
    canManageTeam: candidate.canManageTeam,
    canManagePlayers: candidate.canManagePlayers,
    joinedAt: candidate.joinedAt,
    status: 'active',
    createdAt,
    updatedAt: candidate.updatedAt,
  } satisfies MembershipIndexDocument;
}

function comparableIndexDocument(document: Record<string, unknown> | MembershipIndexDocument | null) {
  if (!document) {
    return null;
  }

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
    roles: Array.isArray(document.roles)
      ? uniqueRoles(
          document.roles.filter(
            (role): role is TeamMemberRole => role === 'admin' || role === 'player',
          ),
        )
      : [],
    canManageTeam: document.canManageTeam === true,
    canManagePlayers: document.canManagePlayers === true,
    joinedAt: normalizeString(document.joinedAt) ?? null,
    status: normalizeTeamMemberStatus(document.status),
    createdAt: normalizeString(document.createdAt) ?? null,
    updatedAt: normalizeString(document.updatedAt) ?? null,
  };
}

async function readTeamMembers(firestore: Firestore, summary: Summary) {
  const groupedMemberships = new Map<string, CandidateMembership>();
  let lastDocumentId: string | null = null;

  while (true) {
    let teamMembersQuery = firestore
      .collection('teamMembers')
      .orderBy(FieldPath.documentId())
      .limit(READ_PAGE_SIZE);

    if (lastDocumentId) {
      teamMembersQuery = teamMembersQuery.startAfter(lastDocumentId);
    }

    const snapshot = await teamMembersQuery.get();
    if (snapshot.empty) {
      break;
    }

    for (const document of snapshot.docs) {
      summary.totalRead += 1;
      const candidate = validateMembershipDocument(
        {
          id: document.id,
          ...(document.data() as Omit<RawTeamMemberDocument, 'id'>),
        },
        summary,
      );

      if (!candidate) {
        continue;
      }

      candidate.priority = membershipPriority(candidate);
      const key = `${candidate.teamId}__${candidate.userId}`;
      const previous = groupedMemberships.get(key) ?? null;

      if (!previous) {
        groupedMemberships.set(key, candidate);
        continue;
      }

      if (compareCandidates(candidate, previous) > 0) {
        incrementReason(summary, 'duplicate-membership-lower-priority');
        groupedMemberships.set(key, candidate);
        continue;
      }

      incrementReason(summary, 'duplicate-membership-lower-priority');
    }

    lastDocumentId = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
    if (snapshot.size < READ_PAGE_SIZE) {
      break;
    }
  }

  summary.totalUniqueTargets = groupedMemberships.size;
  return [...groupedMemberships.entries()];
}

async function planMutations(
  firestore: Firestore,
  groupedMemberships: Array<[string, CandidateMembership]>,
  summary: Summary,
) {
  const plannedMutations: PlannedMutation[] = [];

  for (let index = 0; index < groupedMemberships.length; index += WRITE_BATCH_SIZE) {
    const chunk = groupedMemberships.slice(index, index + WRITE_BATCH_SIZE);
    const refs = chunk.map(([, candidate]) =>
      firestore
        .collection(INDEX_ROOT_COLLECTION)
        .doc(candidate.teamId)
        .collection(INDEX_MEMBERS_SUBCOLLECTION)
        .doc(candidate.userId),
    );
    const snapshots = await firestore.getAll(...refs);

    for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
      const [key, candidate] = chunk[chunkIndex];
      const ref = refs[chunkIndex];
      const existingSnapshot = snapshots[chunkIndex];
      const existingData = existingSnapshot.exists
        ? (existingSnapshot.data() as Record<string, unknown>)
        : undefined;
      const nextDocument = buildIndexDocument(candidate, existingData);
      const comparableExisting = comparableIndexDocument(existingData ?? null);
      const comparableNext = comparableIndexDocument(nextDocument);
      const action = !existingSnapshot.exists
        ? 'create'
        : JSON.stringify(comparableExisting) === JSON.stringify(comparableNext)
          ? 'unchanged'
          : 'update';

      if (action === 'create') {
        summary.totalCreated += 1;
      } else if (action === 'update') {
        summary.totalUpdated += 1;
      } else {
        summary.totalUnchanged += 1;
      }

      plannedMutations.push({
        key,
        action,
        ref,
        document: nextDocument,
        sourceTeamMemberId: candidate.sourceTeamMemberId,
      });
    }
  }

  return plannedMutations;
}

async function executeMutations(
  firestore: Firestore,
  mutations: PlannedMutation[],
  dryRun: boolean,
) {
  for (const mutation of mutations) {
    if (mutation.action === 'unchanged') {
      log('skip-unchanged', {
        key: mutation.key,
        sourceTeamMemberId: mutation.sourceTeamMemberId,
      });
      continue;
    }

    log(dryRun ? 'plan-write' : 'write', {
      action: mutation.action,
      key: mutation.key,
      path: mutation.ref.path,
      sourceTeamMemberId: mutation.sourceTeamMemberId,
    });
  }

  if (dryRun) {
    return;
  }

  const writeQueue = mutations.filter((mutation) => mutation.action !== 'unchanged');

  for (let index = 0; index < writeQueue.length; index += WRITE_BATCH_SIZE) {
    const batch = firestore.batch();
    const chunk = writeQueue.slice(index, index + WRITE_BATCH_SIZE);

    for (const mutation of chunk) {
      batch.set(mutation.ref, mutation.document, { merge: true });
    }

    await batch.commit();
  }
}

async function main() {
  const fileEnv = parseDotEnvFile(path.resolve(process.cwd(), '.env'));
  const options = parseArguments(process.argv.slice(2), fileEnv);
  const summary: Summary = {
    totalRead: 0,
    totalValid: 0,
    totalIgnored: 0,
    totalUniqueTargets: 0,
    totalCreated: 0,
    totalUpdated: 0,
    totalUnchanged: 0,
    ignoredReasons: {},
  };

  log('start', {
    mode: options.dryRun ? 'dry-run' : 'write',
    projectId: options.projectId ?? 'auto',
    credentialsPath: options.credentialsPath ?? 'application-default',
  });

  const firestore = initializeFirestore(options);
  const groupedMemberships = await readTeamMembers(firestore, summary);
  const plannedMutations = await planMutations(firestore, groupedMemberships, summary);

  await executeMutations(firestore, plannedMutations, options.dryRun);

  log('summary', {
    totalTeamMembersRead: summary.totalRead,
    totalValidMemberships: summary.totalValid,
    totalIgnoredMemberships: summary.totalIgnored,
    totalUniqueMembershipTargets: summary.totalUniqueTargets,
    totalCreated: summary.totalCreated,
    totalUpdated: summary.totalUpdated,
    totalCreatedOrUpdated: summary.totalCreated + summary.totalUpdated,
    totalUnchanged: summary.totalUnchanged,
    ignoredReasons: summary.ignoredReasons,
  });
}

main().catch((error) => {
  console.error(
    '[membership-index-backfill] failed',
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

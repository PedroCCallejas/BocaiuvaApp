/**
 * Diagnóstico de permissão para encerrar partida.
 *
 * Uso:  npm run audit:finish-permission -- <matchId> <uid>
 * Ex.:  npm run audit:finish-permission -- Foj9LLwxh9ZSJULDQbbi Nsp6WknOsHcXpOKQ7uaMB3aZMM52
 *
 * Somente leitura — não altera nada no Firestore.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Constantes ────────────────────────────────────────────────────────────

const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  'secrets',
  'bocaiuva-app-firebase-service-account.json',
);

const COLLECTIONS = {
  matches: 'matches',
  teams: 'teams',
  teamMembers: 'teamMembers',
  users: 'users',
  teamMembershipIndex: 'teamMembershipIndex',
} as const;

const INDEX_MEMBERS_SUB = 'members';

// ─── Tipos locais ──────────────────────────────────────────────────────────

type RawDoc = Record<string, unknown>;
type RawMemberDoc = RawDoc & {
  id: string;
  teamId?: unknown;
  userId?: unknown;
  status?: unknown;
  canManageTeam?: unknown;
  canManagePlayers?: unknown;
  roles?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
};

type DiagnosisItem = {
  label: string;
  ok: boolean;
  detail: string;
};

// ─── Utilidades ────────────────────────────────────────────────────────────

function parseDotEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {} as Record<string, string>;
  const entries: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf('=');
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function bool(v: unknown): boolean {
  return v === true;
}

function roles(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is string => typeof r === 'string');
}

function initFirestore() {
  if (getApps().length > 0) return getFirestore(getApps()[0]);

  const fileEnv = parseDotEnvFile(path.resolve(process.cwd(), '.env.local'));
  const credPath = existsSync(DEFAULT_SERVICE_ACCOUNT_PATH) ? DEFAULT_SERVICE_ACCOUNT_PATH : null;
  const projectId =
    str(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ??
    str(fileEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ??
    str(process.env.FIREBASE_PROJECT_ID) ??
    str(fileEnv.FIREBASE_PROJECT_ID) ??
    null;

  if (credPath) {
    const sa = JSON.parse(readFileSync(credPath, 'utf8')) as ServiceAccount & { project_id?: string };
    const app = initializeApp({ credential: cert(sa), projectId: projectId ?? sa.project_id });
    return getFirestore(app);
  }

  const app = initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
  return getFirestore(app);
}

function ok(label: string, detail: string): DiagnosisItem {
  return { label, ok: true, detail };
}

function fail(label: string, detail: string): DiagnosisItem {
  return { label, ok: false, detail };
}

function printSection(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function printDiagnosis(items: DiagnosisItem[]) {
  for (const item of items) {
    const icon = item.ok ? '✅' : '❌';
    console.log(`  ${icon}  ${item.label}: ${item.detail}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (args.length < 2) {
    console.error('Uso: npm run audit:finish-permission -- <matchId> <uid>');
    console.error('Ex.: npm run audit:finish-permission -- Foj9LLwxh9ZSJULDQbbi Nsp6WknOsHcXpOKQ7uaMB3aZMM52');
    process.exit(1);
  }

  const [matchId, uid] = args;
  console.log(`\n[audit-finish-permission] matchId=${matchId}  uid=${uid}`);

  const db = initFirestore();

  // ── 1. Buscar partida ──────────────────────────────────────────────────

  printSection('1. Partida');
  const matchSnap = await db.collection(COLLECTIONS.matches).doc(matchId).get();

  if (!matchSnap.exists) {
    console.log(`  ❌  Partida "${matchId}" NÃO ENCONTRADA no Firestore.`);
    process.exit(1);
  }

  const matchData = matchSnap.data() as RawDoc;
  const matchTeamId = str(matchData.teamId);
  const matchStatus = str(matchData.status) ?? 'desconhecido';
  const opponent = str(matchData.opponentName) ?? '(sem nome)';

  console.log(`  id        : ${matchId}`);
  console.log(`  teamId    : ${matchTeamId ?? '(ausente)'}`);
  console.log(`  status    : ${matchStatus}`);
  console.log(`  oponente  : ${opponent}`);
  console.log(`  data      : ${str(matchData.date) ?? '(sem data)'}`);

  if (!matchTeamId) {
    console.log('\n  ❌  PROBLEMA: partida sem campo "teamId".');
    process.exit(1);
  }

  // ── 2. Buscar time da partida ──────────────────────────────────────────

  printSection('2. Time da partida');
  const teamSnap = await db.collection(COLLECTIONS.teams).doc(matchTeamId).get();
  const teamName = teamSnap.exists ? str((teamSnap.data() as RawDoc).name) ?? '(sem nome)' : '(não encontrado)';
  const teamAdminUserId = teamSnap.exists ? str((teamSnap.data() as RawDoc).adminUserId) ?? null : null;

  console.log(`  teamId      : ${matchTeamId}`);
  console.log(`  nome        : ${teamName}`);
  console.log(`  adminUserId : ${teamAdminUserId ?? '(ausente)'}`);

  // ── 3. Buscar usuário ──────────────────────────────────────────────────

  printSection('3. Usuário');
  const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get();

  if (!userSnap.exists) {
    console.log(`  ❌  Usuário "${uid}" NÃO ENCONTRADO.`);
  }

  const userData = userSnap.exists ? (userSnap.data() as RawDoc) : null;
  const activeTeamId = userData ? str(userData.activeTeamId) : null;
  const appRole = userData ? str(userData.appRole) : null;

  console.log(`  uid           : ${uid}`);
  console.log(`  activeTeamId  : ${activeTeamId ?? '(null)'}`);
  console.log(`  appRole       : ${appRole ?? '(null)'}`);
  console.log(`  isTeamAdmin   : ${teamAdminUserId === uid ? 'SIM (adminUserId == uid)' : 'não'}`);

  // ── 4. Buscar teamMembers para uid + matchTeamId ────────────────────

  printSection('4. teamMembers (userId == uid AND teamId == matchTeamId)');
  const membersSnap = await db
    .collection(COLLECTIONS.teamMembers)
    .where('userId', '==', uid)
    .where('teamId', '==', matchTeamId)
    .get();

  if (membersSnap.empty) {
    console.log(`  ❌  Nenhum documento encontrado.`);
  }

  const memberDocs: RawMemberDoc[] = membersSnap.docs.map((d) => {
    const data = d.data() as RawDoc;
    return { ...data, id: d.id } as RawMemberDoc;
  });

  for (const m of memberDocs) {
    const mCanManage = bool(m.canManageTeam);
    const mRoles = roles(m.roles);
    const mStatus = str(m.status) ?? 'desconhecido';
    console.log(`  membership id   : ${m.id}`);
    console.log(`    status        : ${mStatus}`);
    console.log(`    canManageTeam : ${mCanManage}`);
    console.log(`    roles         : [${mRoles.join(', ')}]`);
    console.log(`    updatedAt     : ${str(m.updatedAt) ?? '(ausente)'}`);
    const effectivePermission = mCanManage || mRoles.includes('admin');
    console.log(`    -> canManage (canManageTeam || roles.includes(admin)): ${effectivePermission}`);
  }

  const activeMember = memberDocs.find((m) => str(m.status) === 'active');
  const memberCanManage = activeMember
    ? bool(activeMember.canManageTeam) || roles(activeMember.roles).includes('admin')
    : false;

  // ── 5. Buscar teamMembershipIndex ────────────────────────────────────

  printSection('5. teamMembershipIndex (índice Firestore)');
  const indexRef = db
    .collection(COLLECTIONS.teamMembershipIndex)
    .doc(matchTeamId)
    .collection(INDEX_MEMBERS_SUB)
    .doc(uid);

  const indexSnap = await indexRef.get();

  if (!indexSnap.exists) {
    console.log(`  ❌  Documento NÃO EXISTE: teamMembershipIndex/${matchTeamId}/members/${uid}`);
    console.log(`  -> Isso fará TODAS as escritas do Firestore falharem com permission-denied.`);
    console.log(`  -> Solução: npm run backfill:membership-index`);
  } else {
    const idx = indexSnap.data() as RawDoc;
    const idxStatus = str(idx.status) ?? 'desconhecido';
    const idxCanManage = bool(idx.canManageTeam);
    const idxRoles = roles(idx.roles);
    const idxUpdatedAt = str(idx.updatedAt) ?? '(ausente)';

    console.log(`  path          : teamMembershipIndex/${matchTeamId}/members/${uid}`);
    console.log(`  status        : ${idxStatus}`);
    console.log(`  canManageTeam : ${idxCanManage}`);
    console.log(`  roles         : [${idxRoles.join(', ')}]`);
    console.log(`  updatedAt     : ${idxUpdatedAt}`);

    const idxEffective = idxCanManage || idxRoles.includes('admin');
    console.log(`  -> canManage via index (para Firestore Rules): ${idxEffective}`);

    if (activeMember) {
      const memberUpdatedAt = str(activeMember.updatedAt) ?? null;
      if (memberUpdatedAt && idxUpdatedAt !== memberUpdatedAt) {
        console.log(`\n  ⚠️  ÍNDICE DESATUALIZADO:`);
        console.log(`     teamMembers.updatedAt : ${memberUpdatedAt}`);
        console.log(`     index.updatedAt       : ${idxUpdatedAt}`);
        console.log(`     -> Solução: npm run backfill:membership-index`);
      }
    }
  }

  // ── 6. Diagnóstico final ──────────────────────────────────────────────

  printSection('6. Diagnóstico — canFinishMatch');

  const indexExists = indexSnap.exists;
  const indexData = indexExists ? (indexSnap.data() as RawDoc) : null;
  const indexActive = indexData ? str(indexData.status) === 'active' : false;
  const indexCanManage = indexData ? bool(indexData.canManageTeam) || roles(indexData.roles).includes('admin') : false;

  const isTeamOwner = teamAdminUserId === uid;
  const canFinishByRules = isTeamOwner || (indexExists && indexActive && indexCanManage);

  const items: DiagnosisItem[] = [
    matchTeamId
      ? ok('Partida tem teamId', matchTeamId)
      : fail('Partida tem teamId', 'AUSENTE'),
    matchStatus !== 'canceled'
      ? ok('Status da partida', matchStatus)
      : fail('Status da partida', `${matchStatus} — partida cancelada não pode ser encerrada`),
    userSnap.exists
      ? ok('Usuário existe', uid)
      : fail('Usuário existe', 'NÃO ENCONTRADO'),
    activeTeamId === matchTeamId
      ? ok('activeTeamId == match.teamId', `${activeTeamId}`)
      : fail('activeTeamId == match.teamId', `ativo=${activeTeamId ?? 'null'} vs partida=${matchTeamId}`),
    activeMember
      ? ok('Membership ativa encontrada', activeMember.id as string)
      : fail('Membership ativa encontrada', `Nenhuma em teamMembers para uid=${uid} teamId=${matchTeamId}`),
    memberCanManage
      ? ok('canManage via teamMembers', 'true (canManageTeam ou roles.admin)')
      : fail('canManage via teamMembers', 'false — verifique canManageTeam e roles'),
    indexExists
      ? ok('Índice existe', `teamMembershipIndex/${matchTeamId}/members/${uid}`)
      : fail('Índice existe', 'AUSENTE — execute: npm run backfill:membership-index'),
    indexActive
      ? ok('Índice status=active', 'ok')
      : fail('Índice status=active', `status=${String(indexData?.status ?? 'ausente')}`),
    indexCanManage
      ? ok('canManage via índice (Firestore Rules)', 'true')
      : fail('canManage via índice (Firestore Rules)', 'false — Rules negarão a escrita'),
    isTeamOwner
      ? ok('É dono do time (adminUserId)', 'sim — isTeamAdminNow = true')
      : ok('É dono do time (adminUserId)', 'não — depende do índice para ter permissão'),
  ];

  printDiagnosis(items);

  const failedItems = items.filter((i) => !i.ok);

  console.log(`\n${'═'.repeat(60)}`);

  if (canFinishByRules) {
    console.log('  ✅  RESULTADO: permissão deve funcionar pelo Firestore Rules.');
    console.log('     Se o erro persiste, o problema pode estar na leitura do membership');
    console.log('     ou no campo "activeTeamId" do usuário.');
  } else {
    console.log('  ❌  RESULTADO: permissão NEGADA pelas Firestore Rules.');
    console.log('\n  Causas prováveis:');
    for (const f of failedItems) {
      console.log(`    - ${f.label}: ${f.detail}`);
    }
    if (!indexExists || !indexActive) {
      console.log('\n  AÇÃO NECESSÁRIA:');
      console.log('    npm run backfill:membership-index');
    }
    if (activeMember && !memberCanManage) {
      console.log('\n  AÇÃO NECESSÁRIA:');
      console.log('    O campo canManageTeam e/ou roles do teamMember está incorreto.');
      console.log('    Verifique e corrija manualmente no Firestore ou via script de reparo.');
    }
  }

  console.log('═'.repeat(60));
}

main().catch((err) => {
  console.error('[audit-finish-permission] Erro fatal:', err);
  process.exit(1);
});

/**
 * Auditoria e reconciliação de estatísticas de jogadores (Professô FC).
 *
 * Regra oficial de participação:
 *   jogo disputado = partida 'finished' + MatchStat com played=true + presença 'confirmed'.
 *
 * Modos:
 *   dry-run (padrão) — só lê e imprime o relatório; nenhum dado é alterado.
 *   --apply --yes --confirm-team <teamId> --project-id <id>
 *                    — sincroniza a súmula (matchStats) com a presença confirmada
 *                      em partidas encerradas:
 *                        - cria MatchStat (played=true, 0 gols/assists) para
 *                          confirmado sem súmula;
 *                        - remove MatchStat órfão (presença não confirmada) APENAS
 *                          quando o registro não tem gols nem assistências — casos
 *                          com eventos são listados para revisão humana.
 *                      Nunca apaga partidas, presenças ou jogadores; nunca altera
 *                      gols/assistências existentes. Idempotente: rodar duas vezes
 *                      não gera novas mutações.
 *
 * Uso:
 *   node --no-warnings --experimental-strip-types ./scripts/audit-player-stats.ts \
 *     --team <teamId> [--players id1,id2] [--names "Frank,Abner"] \
 *     [--credentials caminho.json] [--project-id id]
 *     [--apply --yes --confirm-team <teamId>]
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

type MatchStatus = 'scheduled' | 'confirmed' | 'finished' | 'canceled';

type MatchDoc = {
  id: string;
  teamId: string;
  date: string;
  opponentName: string;
  status: MatchStatus;
  deletedAt?: string | null;
  scoreboard?: { team: number; opponent: number; result: string } | null;
  mvpWinnerPlayerIds?: string[];
  manualMvpPlayerId?: string | null;
};

type AttendanceDoc = {
  id: string;
  teamId: string;
  matchId: string;
  playerId: string;
  status: 'confirmed' | 'absent' | 'pending';
};

type MatchStatDoc = {
  id: string;
  teamId: string;
  matchId: string;
  playerId: string;
  played: boolean;
  goals: number;
  assists: number;
  yellowCards?: number;
  redCards?: number;
  notes?: string;
};

type MvpVoteDoc = {
  id: string;
  teamId: string;
  matchId: string;
  voterPlayerId: string;
  targetPlayerId: string;
};

type PlayerRatingDoc = {
  id: string;
  teamId: string;
  matchId: string;
  raterPlayerId: string;
  targetPlayerId: string;
};

type PlayerDoc = {
  id: string;
  teamId: string;
  fullName: string;
  nickname: string;
  deletedAt?: string | null;
  manualStats?: {
    matches?: number;
    goals?: number;
    assists?: number;
  } | null;
};

type PlannedMutation =
  | {
      kind: 'create-matchstat';
      matchId: string;
      playerId: string;
      docId: string;
    }
  | {
      kind: 'delete-orphan-matchstat';
      matchId: string;
      playerId: string;
      docId: string;
    };

type ReviewItem = {
  matchId: string;
  playerId: string;
  reason: string;
  goals: number;
  assists: number;
};

const WRITE_BATCH_SIZE = 250;
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  'secrets',
  'bocaiuva-app-firebase-service-account.json',
);

function log(message: string) {
  console.log(`[audit-player-stats] ${message}`);
}

function parseArguments(argv: string[]) {
  const options = {
    teamId: null as string | null,
    playerIds: [] as string[],
    names: [] as string[],
    credentialsPath: null as string | null,
    projectId: null as string | null,
    confirmTeamId: null as string | null,
    apply: false,
    yes: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case '--team':
        options.teamId = argv[++index] ?? null;
        break;
      case '--players':
        options.playerIds = (argv[++index] ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        break;
      case '--names':
        options.names = (argv[++index] ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        break;
      case '--credentials':
        options.credentialsPath = argv[++index] ?? null;
        break;
      case '--project-id':
        options.projectId = argv[++index] ?? null;
        break;
      case '--confirm-team':
        options.confirmTeamId = argv[++index] ?? null;
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--yes':
        options.yes = true;
        break;
      case '--dry-run':
        options.apply = false;
        break;
      default:
        throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }

  options.teamId = options.teamId?.trim() || null;
  options.projectId = options.projectId?.trim() || null;
  options.confirmTeamId = options.confirmTeamId?.trim() || null;

  if (!options.teamId) {
    throw new Error(
      'Informe o time: --team <teamId>. O script nunca roda sobre todos os times de uma vez.',
    );
  }

  if (options.apply && !options.yes) {
    throw new Error('--apply exige também --yes. Nenhuma conexão foi iniciada.');
  }

  if (options.apply && options.confirmTeamId !== options.teamId) {
    throw new Error(
      `--apply exige --confirm-team "${options.teamId}" exatamente igual ao --team.`,
    );
  }

  if (options.apply && !options.projectId) {
    throw new Error('--apply exige --project-id <id> explícito para evitar o projeto errado.');
  }

  return options;
}

function initFirestore(credentialsPath: string | null, projectId: string | null): Firestore {
  if (getApps().length === 0) {
    const resolvedPath =
      credentialsPath ??
      process.env.GOOGLE_APPLICATION_CREDENTIALS ??
      (existsSync(DEFAULT_SERVICE_ACCOUNT_PATH) ? DEFAULT_SERVICE_ACCOUNT_PATH : null);

    if (resolvedPath && existsSync(resolvedPath)) {
      const serviceAccount = JSON.parse(readFileSync(resolvedPath, 'utf8')) as ServiceAccount & {
        project_id?: string;
      };
      initializeApp({
        credential: cert(serviceAccount),
        projectId: projectId ?? serviceAccount.project_id,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId: projectId ?? undefined,
      });
    }
  }

  return getFirestore();
}

async function fetchCollectionForTeam<T>(
  firestore: Firestore,
  collectionName: string,
  teamId: string,
): Promise<T[]> {
  const snapshot = await firestore
    .collection(collectionName)
    .where('teamId', '==', teamId)
    .get();

  return snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  })) as T[];
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function pad(value: string | number, width: number) {
  return String(value).padEnd(width);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const mode = options.apply ? 'apply' : 'dry-run';

  log(`modo: ${mode} · time: ${options.teamId}`);

  const firestore = initFirestore(options.credentialsPath, options.projectId);
  const selectedProjectId = getApp().options.projectId ?? '(não identificado)';
  log(`projeto Firebase selecionado: ${selectedProjectId}`);
  const teamId = options.teamId!;

  const [matches, attendance, matchStats, players, mvpVotes, playerRatings] =
    await Promise.all([
      fetchCollectionForTeam<MatchDoc>(firestore, 'matches', teamId),
      fetchCollectionForTeam<AttendanceDoc>(firestore, 'attendance', teamId),
      fetchCollectionForTeam<MatchStatDoc>(firestore, 'matchStats', teamId),
      fetchCollectionForTeam<PlayerDoc>(firestore, 'players', teamId),
      fetchCollectionForTeam<MvpVoteDoc>(firestore, 'mvpVotes', teamId),
      fetchCollectionForTeam<PlayerRatingDoc>(firestore, 'playerRatings', teamId),
    ]);

  log(
    `lidos: ${matches.length} partidas, ${attendance.length} presenças, ` +
      `${matchStats.length} matchStats, ${players.length} jogadores, ` +
      `${mvpVotes.length} votos MVP, ${playerRatings.length} avaliações`,
  );

  // Localiza IDs a partir de nomes/apelidos (apenas para seleção do relatório;
  // toda a reconciliação usa IDs). Nomes duplicados são reportados.
  const selectedIds = new Set(options.playerIds);
  const ambiguousNames: string[] = [];
  for (const name of options.names) {
    const normalized = normalizeName(name);
    const candidates = players.filter(
      (player) =>
        normalizeName(player.nickname) === normalized ||
        normalizeName(player.fullName) === normalized ||
        normalizeName(player.fullName).includes(normalized) ||
        normalizeName(player.nickname).includes(normalized),
    );

    if (candidates.length === 0) {
      log(`AVISO: nenhum jogador encontrado para o nome "${name}".`);
    } else if (candidates.length > 1) {
      ambiguousNames.push(name);
      log(
        `AVISO: nome "${name}" é ambíguo (${candidates
          .map((player) => `${player.nickname}=${player.id}`)
          .join(', ')}). Todos entram no relatório; use --players para restringir.`,
      );
      candidates.forEach((player) => selectedIds.add(player.id));
    } else {
      selectedIds.add(candidates[0].id);
    }
  }

  if (mode === 'apply' && ambiguousNames.length > 0) {
    throw new Error(
      `Apply bloqueado: nomes ambíguos (${ambiguousNames.join(', ')}). Use --players com IDs explícitos.`,
    );
  }

  const targetPlayers =
    selectedIds.size > 0
      ? players.filter((player) => selectedIds.has(player.id))
      : players;

  const finishedMatches = matches.filter(
    (match) => match.status === 'finished' && !match.deletedAt,
  );
  const finishedMatchIds = new Set(finishedMatches.map((match) => match.id));
  const matchById = new Map(matches.map((match) => [match.id, match]));

  const confirmedByMatch = new Map<string, Set<string>>();
  for (const record of attendance) {
    if (record.status !== 'confirmed') {
      continue;
    }
    const set = confirmedByMatch.get(record.matchId) ?? new Set<string>();
    set.add(record.playerId);
    confirmedByMatch.set(record.matchId, set);
  }

  const statsByPlayer = new Map<string, MatchStatDoc[]>();
  for (const stat of matchStats) {
    const list = statsByPlayer.get(stat.playerId) ?? [];
    list.push(stat);
    statsByPlayer.set(stat.playerId, list);
  }

  // ---------- Relatório por jogador: exibido (calculado + manual) x calculado ----------
  log('');
  log('=== Totais por jogador (jogo = finished + played + confirmado) ===');
  console.log(
    `${pad('Jogador', 22)}${pad('ID', 24)}${pad('JogosCalc', 10)}${pad('AjusteMan', 10)}` +
      `${pad('JogosExib', 10)}${pad('GolsCalc', 9)}${pad('GolsExib', 9)}${pad('AssistCalc', 11)}${pad('AssistExib', 11)}`,
  );

  const perMatchDetails: string[] = [];

  for (const player of targetPlayers) {
    const playerStats = (statsByPlayer.get(player.id) ?? []).filter(
      (stat) =>
        stat.played &&
        finishedMatchIds.has(stat.matchId) &&
        confirmedByMatch.get(stat.matchId)?.has(player.id),
    );
    const seen = new Set<string>();
    const dedupedStats = playerStats.filter((stat) => {
      if (seen.has(stat.matchId)) {
        return false;
      }
      seen.add(stat.matchId);
      return true;
    });

    const calcGames = dedupedStats.length;
    const calcGoals = dedupedStats.reduce((sum, stat) => sum + (stat.goals ?? 0), 0);
    const calcAssists = dedupedStats.reduce((sum, stat) => sum + (stat.assists ?? 0), 0);
    const manual = player.manualStats ?? {};
    const manualGames = manual.matches ?? 0;
    const manualGoals = manual.goals ?? 0;
    const manualAssists = manual.assists ?? 0;

    console.log(
      `${pad(player.nickname, 22)}${pad(player.id, 24)}${pad(calcGames, 10)}${pad(manualGames, 10)}` +
        `${pad(calcGames + manualGames, 10)}${pad(calcGoals, 9)}${pad(calcGoals + manualGoals, 9)}` +
        `${pad(calcAssists, 11)}${pad(calcAssists + manualAssists, 11)}`,
    );

    if (selectedIds.size > 0) {
      for (const match of [...finishedMatches].sort((a, b) => a.date.localeCompare(b.date))) {
        const confirmed = confirmedByMatch.get(match.id)?.has(player.id) ?? false;
        const stat = (statsByPlayer.get(player.id) ?? []).find(
          (item) => item.matchId === match.id,
        );
        if (!confirmed && !stat) {
          continue;
        }
        const counts = confirmed && Boolean(stat?.played);
        perMatchDetails.push(
          `${player.nickname} | ${match.date} x ${match.opponentName} (${match.id}) | ` +
            `confirmado=${confirmed ? 'sim' : 'não'} | súmula=${stat ? (stat.played ? 'played' : 'não jogou') : 'ausente'} | ` +
            `gols=${stat?.goals ?? 0} assist=${stat?.assists ?? 0} | conta jogo=${counts ? 'SIM' : 'NÃO'}`,
        );
      }
    }
  }

  if (perMatchDetails.length > 0) {
    log('');
    log('=== Detalhe por partida (jogadores selecionados) ===');
    perMatchDetails.forEach((line) => console.log(line));
  }

  // ---------- Inconsistências e mutações planejadas ----------
  const mutations: PlannedMutation[] = [];
  const reviewItems: ReviewItem[] = [];
  const duplicateAttendanceKeys = new Set<string>();
  const attendanceCounts = new Map<string, number>();

  for (const record of attendance) {
    const key = `${record.matchId}__${record.playerId}`;
    const count = (attendanceCounts.get(key) ?? 0) + 1;
    attendanceCounts.set(key, count);
    if (count > 1) duplicateAttendanceKeys.add(key);
  }

  for (const match of finishedMatches) {
    const confirmed = confirmedByMatch.get(match.id) ?? new Set<string>();
    const statsForMatch = matchStats.filter((stat) => stat.matchId === match.id);
    const statPlayerIds = new Set(statsForMatch.map((stat) => stat.playerId));
    const duplicateStatPlayerIds = new Set<string>();
    const statCounts = new Map<string, number>();

    for (const stat of statsForMatch) {
      const count = (statCounts.get(stat.playerId) ?? 0) + 1;
      statCounts.set(stat.playerId, count);
      if (count > 1) duplicateStatPlayerIds.add(stat.playerId);
    }

    for (const playerId of new Set([...duplicateStatPlayerIds, ...confirmed])) {
      const key = `${match.id}__${playerId}`;
      if (!duplicateStatPlayerIds.has(playerId) && !duplicateAttendanceKeys.has(key)) {
        continue;
      }

      const duplicateStats = statsForMatch.filter((stat) => stat.playerId === playerId);
      reviewItems.push({
        matchId: match.id,
        playerId,
        reason: duplicateStatPlayerIds.has(playerId)
          ? 'Múltiplas súmulas para matchId + playerId — aplicação bloqueada para este par.'
          : 'Múltiplos registros de presença para matchId + playerId — aplicação bloqueada para este par.',
        goals: duplicateStats.reduce((sum, stat) => sum + (stat.goals ?? 0), 0),
        assists: duplicateStats.reduce((sum, stat) => sum + (stat.assists ?? 0), 0),
      });
    }

    for (const playerId of confirmed) {
      if (
        duplicateStatPlayerIds.has(playerId) ||
        duplicateAttendanceKeys.has(`${match.id}__${playerId}`)
      ) {
        continue;
      }
      if (!statPlayerIds.has(playerId)) {
        mutations.push({
          kind: 'create-matchstat',
          matchId: match.id,
          playerId,
          docId: `${match.id}__${playerId}`,
        });
      }
    }

    for (const stat of statsForMatch) {
      if (
        duplicateStatPlayerIds.has(stat.playerId) ||
        duplicateAttendanceKeys.has(`${match.id}__${stat.playerId}`)
      ) {
        continue;
      }
      if (!confirmed.has(stat.playerId)) {
        const hasStatEvents =
          (stat.goals ?? 0) > 0 ||
          (stat.assists ?? 0) > 0 ||
          (stat.yellowCards ?? 0) > 0 ||
          (stat.redCards ?? 0) > 0 ||
          Boolean(stat.notes?.trim());
        const hasRating = playerRatings.some(
          (rating) =>
            rating.matchId === match.id &&
            (rating.targetPlayerId === stat.playerId || rating.raterPlayerId === stat.playerId),
        );
        const hasMvpDependency =
          match.mvpWinnerPlayerIds?.includes(stat.playerId) === true ||
          match.manualMvpPlayerId === stat.playerId ||
          mvpVotes.some(
            (vote) =>
              vote.matchId === match.id &&
              (vote.targetPlayerId === stat.playerId || vote.voterPlayerId === stat.playerId),
          );

        if (hasStatEvents || hasRating || hasMvpDependency) {
          const dependencies = [
            hasStatEvents ? 'eventos na súmula' : null,
            hasRating ? 'avaliação relacionada' : null,
            hasMvpDependency ? 'voto/resultado MVP relacionado' : null,
          ].filter(Boolean);
          reviewItems.push({
            matchId: match.id,
            playerId: stat.playerId,
            reason:
              `MatchStat órfão com ${dependencies.join(', ')} — presença não confirmada. Revisão humana necessária.`,
            goals: stat.goals ?? 0,
            assists: stat.assists ?? 0,
          });
        } else {
          mutations.push({
            kind: 'delete-orphan-matchstat',
            matchId: match.id,
            playerId: stat.playerId,
            docId: stat.id,
          });
        }
      }
    }
  }

  const canceledWithStats = matches.filter(
    (match) =>
      match.status === 'canceled' &&
      matchStats.some((stat) => stat.matchId === match.id && stat.played),
  );

  log('');
  log('=== Inconsistências encontradas ===');
  log(`confirmado sem súmula em partida encerrada: ${
    mutations.filter((m) => m.kind === 'create-matchstat').length
  }`);
  log(`súmula órfã sem eventos (presença não confirmada): ${
    mutations.filter((m) => m.kind === 'delete-orphan-matchstat').length
  }`);
  log(`súmula órfã COM eventos (revisão humana): ${reviewItems.length}`);
  log(`partidas canceladas com súmula played: ${canceledWithStats.length}`);

  for (const mutation of mutations) {
    const match = matchById.get(mutation.matchId);
    const player = players.find((item) => item.id === mutation.playerId);
    log(
      `${mode === 'apply' ? 'write' : 'plan'}: ${mutation.kind} · ` +
        `${match?.date ?? '?'} x ${match?.opponentName ?? '?'} (${mutation.matchId}) · ` +
        `${player?.nickname ?? mutation.playerId}`,
    );
  }

  for (const item of reviewItems) {
    const match = matchById.get(item.matchId);
    const player = players.find((entry) => entry.id === item.playerId);
    log(
      `REVISAR: ${match?.date ?? '?'} x ${match?.opponentName ?? '?'} (${item.matchId}) · ` +
        `${player?.nickname ?? item.playerId} · gols=${item.goals} assist=${item.assists} · ${item.reason}`,
    );
  }

  if (mode !== 'apply') {
    log('');
    log('dry-run concluído. NENHUM dado foi alterado.');
    log(
      `Para aplicar: --apply --yes --confirm-team "${teamId}" --project-id "${selectedProjectId}".`,
    );
    return;
  }

  // ---------- Apply (sincronização súmula ↔ presença em partidas encerradas) ----------
  const now = new Date().toISOString();
  let written = 0;
  log(`documentos que serão escritos/excluídos: ${mutations.length}`);

  for (let index = 0; index < mutations.length; index += WRITE_BATCH_SIZE) {
    const chunk = mutations.slice(index, index + WRITE_BATCH_SIZE);
    const batch = firestore.batch();

    for (const mutation of chunk) {
      const ref = firestore.collection('matchStats').doc(mutation.docId);

      if (mutation.kind === 'create-matchstat') {
        batch.set(ref, {
          id: mutation.docId,
          teamId,
          matchId: mutation.matchId,
          playerId: mutation.playerId,
          played: true,
          started: false,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          notes: '',
          createdAt: now,
          updatedAt: now,
        });
      } else {
        batch.delete(ref);
      }
    }

    await batch.commit();
    written += chunk.length;
    log(`lote aplicado: ${written}/${mutations.length}`);
  }

  const afterMatchStats = await fetchCollectionForTeam<MatchStatDoc>(
    firestore,
    'matchStats',
    teamId,
  );
  log(
    `relatório antes/depois: matchStats ${matchStats.length} -> ${afterMatchStats.length}; ` +
      `mutações aplicadas: ${mutations.length}; revisão humana preservada: ${reviewItems.length}.`,
  );
  log(`apply concluído. Mutações: ${mutations.length}. Itens para revisão humana: ${reviewItems.length}.`);
  log(`executado por: ${process.env.USERNAME ?? process.env.USER ?? 'desconhecido'} em ${now}`);
}

main().catch((error) => {
  console.error('[audit-player-stats] erro fatal:', error);
  process.exitCode = 1;
});

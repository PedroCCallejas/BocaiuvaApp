import { z } from 'zod';

import { isValidTime } from '@/lib/date';
import type { Match, Player } from '@/types/domain';
import type {
  ImportedMatchPayloadItem,
  ImportedMatchPlayerPayload,
  LegacyMatchImportPlayerPreview,
  LegacyMatchImportPreview,
  MatchImportPlayerResolutionSource,
} from '@/types/match-import';

const importedMatchPlayerSchema = z.object({
  linkedUserId: z.string().trim().min(1).optional().nullable(),
  email: z.string().trim().email('Use um e-mail válido.').optional().nullable(),
  jerseyNumber: z.coerce.number().int().min(0).optional().nullable(),
  name: z.string().trim().min(1).optional().nullable(),
  played: z.boolean().optional(),
  started: z.boolean().optional(),
  goals: z.coerce.number().int().min(0).optional(),
  assists: z.coerce.number().int().min(0).optional(),
});

function isValidIsoDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const candidate = new Date(Number(year), Number(month) - 1, Number(day));
  return (
    candidate.getFullYear() === Number(year) &&
    candidate.getMonth() === Number(month) - 1 &&
    candidate.getDate() === Number(day)
  );
}

const importedMatchSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD.')
    .refine((value) => isValidIsoDate(value), {
      message: 'Informe uma data válida.',
    }),
  time: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => value == null || value === '' || isValidTime(value), {
      message: 'Use o horário no formato HH:mm.',
    }),
  opponentName: z.string().trim().min(1, 'Informe o adversário.'),
  venue: z.string().trim().optional().nullable(),
  matchType: z.enum(['society', 'futsal', 'field', 'training']),
  teamScore: z.coerce.number().int().min(0),
  opponentScore: z.coerce.number().int().min(0),
  players: z.array(importedMatchPlayerSchema),
  notes: z.string().trim().optional().nullable(),
  locationUrl: z.string().trim().optional().nullable(),
  opponentLogoUrl: z.string().trim().optional().nullable(),
  linePlayersCount: z.coerce.number().int().min(1).max(15).optional().nullable(),
});

const importedMatchesSchema = z.array(importedMatchSchema);

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeName(value?: string | null) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function normalizeOptionalTime(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : '';
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function buildImportIssueLabel(path: readonly PropertyKey[]) {
  if (path.length === 0) {
    return 'payload';
  }

  return path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : String(segment)))
    .join('.');
}

function buildLookupLabel(player: ImportedMatchPlayerPayload) {
  if (player.email?.trim()) {
    return player.email.trim();
  }

  if (player.linkedUserId?.trim()) {
    return `uid:${player.linkedUserId.trim()}`;
  }

  if (player.jerseyNumber != null) {
    return `#${player.jerseyNumber}`;
  }

  if (player.name?.trim()) {
    return player.name.trim();
  }

  return 'Sem identificador';
}

function buildMatchedPreview(
  sourceIndex: number,
  player: ImportedMatchPlayerPayload,
  matchedPlayer: Player,
  resolutionSource: MatchImportPlayerResolutionSource,
) {
  return {
    sourceIndex,
    played: player.played ?? true,
    started: player.started ?? (player.played ?? true),
    goals: player.goals ?? 0,
    assists: player.assists ?? 0,
    lookupLabel: buildLookupLabel(player),
    status: 'matched',
    matchedPlayerId: matchedPlayer.id,
    matchedPlayerName: matchedPlayer.nickname || matchedPlayer.fullName,
    matchedPlayerJerseyNumber: matchedPlayer.jerseyNumber,
    resolutionSource,
    message: null,
  } satisfies LegacyMatchImportPlayerPreview;
}

function buildUnresolvedPreview(
  sourceIndex: number,
  player: ImportedMatchPlayerPayload,
  status: LegacyMatchImportPlayerPreview['status'],
  message: string,
) {
  return {
    sourceIndex,
    played: player.played ?? true,
    started: player.started ?? (player.played ?? true),
    goals: player.goals ?? 0,
    assists: player.assists ?? 0,
    lookupLabel: buildLookupLabel(player),
    status,
    matchedPlayerId: null,
    matchedPlayerName: null,
    matchedPlayerJerseyNumber: null,
    resolutionSource: null,
    message,
  } satisfies LegacyMatchImportPlayerPreview;
}

function findExactCandidates(
  players: Player[],
  predicate: (player: Player) => boolean,
) {
  return players.filter(predicate);
}

function resolveImportedPlayer(
  player: ImportedMatchPlayerPayload,
  sourceIndex: number,
  teamPlayers: Player[],
) {
  const normalizedEmail = normalizeText(player.email);
  if (normalizedEmail) {
    const candidates = findExactCandidates(
      teamPlayers,
      (candidate) => normalizeText(candidate.linkedEmail) === normalizedEmail,
    );
    if (candidates.length === 1) {
      return buildMatchedPreview(sourceIndex, player, candidates[0], 'email');
    }
    if (candidates.length > 1) {
      return buildUnresolvedPreview(
        sourceIndex,
        player,
        'conflict',
        'Mais de um jogador do time usa este e-mail vinculado.',
      );
    }
  }

  const normalizedLinkedUserId = normalizeText(player.linkedUserId);
  if (normalizedLinkedUserId) {
    const candidates = findExactCandidates(
      teamPlayers,
      (candidate) => normalizeText(candidate.linkedUserId) === normalizedLinkedUserId,
    );
    if (candidates.length === 1) {
      return buildMatchedPreview(sourceIndex, player, candidates[0], 'linkedUserId');
    }
    if (candidates.length > 1) {
      return buildUnresolvedPreview(
        sourceIndex,
        player,
        'conflict',
        'Mais de um jogador do time aponta para este usuário vinculado.',
      );
    }
  }

  if (player.jerseyNumber != null) {
    const candidates = findExactCandidates(
      teamPlayers,
      (candidate) => candidate.jerseyNumber === player.jerseyNumber,
    );
    if (candidates.length === 1) {
      return buildMatchedPreview(sourceIndex, player, candidates[0], 'jerseyNumber');
    }
    if (candidates.length > 1) {
      return buildUnresolvedPreview(
        sourceIndex,
        player,
        'conflict',
        'Mais de um jogador do time usa esta camisa.',
      );
    }
  }

  const normalizedName = normalizeName(player.name);
  if (normalizedName) {
    const fullNameCandidates = findExactCandidates(
      teamPlayers,
      (candidate) => normalizeName(candidate.fullName) === normalizedName,
    );
    if (fullNameCandidates.length === 1) {
      return buildMatchedPreview(sourceIndex, player, fullNameCandidates[0], 'name');
    }
    if (fullNameCandidates.length > 1) {
      return buildUnresolvedPreview(
        sourceIndex,
        player,
        'conflict',
        'Mais de um jogador combina com este nome completo.',
      );
    }

    const nicknameCandidates = findExactCandidates(
      teamPlayers,
      (candidate) => normalizeName(candidate.nickname) === normalizedName,
    );
    if (nicknameCandidates.length === 1) {
      return buildMatchedPreview(sourceIndex, player, nicknameCandidates[0], 'nickname');
    }
    if (nicknameCandidates.length > 1) {
      return buildUnresolvedPreview(
        sourceIndex,
        player,
        'conflict',
        'Mais de um jogador combina com este apelido.',
      );
    }
  }

  const played = player.played ?? true;
  if (!played && (player.goals ?? 0) === 0 && (player.assists ?? 0) === 0) {
    return buildUnresolvedPreview(
      sourceIndex,
      player,
      'ignored',
      'Jogador sem participação e sem estatísticas. Esta linha será ignorada.',
    );
  }

  return buildUnresolvedPreview(
    sourceIndex,
    player,
    'unmatched',
    'Não foi possível localizar este jogador no time ativo.',
  );
}

function buildDuplicateKey(input: {
  date: string;
  opponentName: string;
  teamScore: number;
  opponentScore: number;
}) {
  return [
    input.date.trim(),
    normalizeName(input.opponentName),
    input.teamScore,
    input.opponentScore,
  ].join('__');
}

function buildExistingMatchDuplicateKey(match: Match) {
  if (!match.scoreboard) {
    return null;
  }

  return buildDuplicateKey({
    date: match.date,
    opponentName: match.opponentName,
    teamScore: match.scoreboard.team,
    opponentScore: match.scoreboard.opponent,
  });
}

export function parseLegacyMatchImportJson(raw: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Cole um JSON valido antes de continuar.');
  }

  const result = importedMatchesSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const label = buildImportIssueLabel(issue.path);
    throw new Error(`${label}: ${issue.message}`);
  }

  return result.data satisfies ImportedMatchPayloadItem[];
}

export function buildLegacyMatchImportPreview(params: {
  payload: ImportedMatchPayloadItem[];
  teamPlayers: Player[];
  existingMatches: Match[];
}) {
  const existingMatchesByKey = new Map<string, Match>();

  for (const match of params.existingMatches) {
    const key = buildExistingMatchDuplicateKey(match);
    if (key && !existingMatchesByKey.has(key)) {
      existingMatchesByKey.set(key, match);
    }
  }

  const seenImportKeys = new Set<string>();
  const items: LegacyMatchImportPreview['items'] = params.payload.map((entry, matchIndex) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const players = entry.players.map((player, playerIndex) =>
      resolveImportedPlayer(player, playerIndex, params.teamPlayers),
    );
    const matchedPlayerIds = players
      .filter((player) => player.status === 'matched' && player.matchedPlayerId)
      .map((player) => player.matchedPlayerId as string);
    const duplicateResolvedPlayerIds = matchedPlayerIds.filter(
      (playerId, index) => matchedPlayerIds.indexOf(playerId) !== index,
    );
    if (duplicateResolvedPlayerIds.length > 0) {
      errors.push('O mesmo jogador foi informado mais de uma vez nesta partida.');
    }

    const playedPlayers = players.filter(
      (player) => player.status === 'matched' && player.played,
    );
    const totalGoals = playedPlayers.reduce((sum, player) => sum + player.goals, 0);

    if (entry.players.length === 0) {
      errors.push('Informe pelo menos um jogador no payload da partida.');
    }

    if (playedPlayers.length === 0) {
      errors.push('A partida precisa ter pelo menos um jogador participante.');
    }

    if (totalGoals > entry.teamScore) {
      errors.push('A soma de gols dos jogadores não pode ultrapassar o placar do time.');
    } else if (totalGoals !== entry.teamScore) {
      warnings.push('A soma de gols dos jogadores esta diferente do placar informado.');
    }

    for (const player of players) {
      if (!player.played && (player.goals > 0 || player.assists > 0)) {
        errors.push(`O jogador ${player.lookupLabel} tem estatísticas, mas foi marcado como não participante.`);
      }
    }

    const duplicateKey = buildDuplicateKey({
      date: entry.date,
      opponentName: entry.opponentName,
      teamScore: entry.teamScore,
      opponentScore: entry.opponentScore,
    });
    const existingDuplicateMatch = existingMatchesByKey.get(duplicateKey) ?? null;
    const payloadDuplicate = seenImportKeys.has(duplicateKey);

    if (payloadDuplicate) {
      warnings.push('Existe outra linha igual a esta dentro da mesma importacao.');
    }

    const unresolvedPlayerCount = players.filter(
      (player) => player.status === 'unmatched',
    ).length;
    const conflictCount = players.filter((player) => player.status === 'conflict').length;

    if (unresolvedPlayerCount > 0) {
      errors.push('Existem jogadores não encontrados para esta partida.');
    }

    if (conflictCount > 0) {
      errors.push('Existem conflitos de identificacao de jogadores nesta partida.');
    }

    const status =
      errors.length > 0
        ? 'invalid'
        : existingDuplicateMatch || payloadDuplicate
          ? 'duplicate'
          : 'ready';

    if (status !== 'invalid') {
      seenImportKeys.add(duplicateKey);
    }

    return {
      sourceIndex: matchIndex,
      status,
      date: entry.date,
      time: normalizeOptionalTime(entry.time),
      opponentName: entry.opponentName.trim(),
      venue: normalizeOptionalString(entry.venue) ?? 'Não informado',
      matchType: entry.matchType,
      teamScore: entry.teamScore,
      opponentScore: entry.opponentScore,
      warnings,
      errors,
      duplicateMatchId: existingDuplicateMatch?.id ?? null,
      players,
      matchedPlayerCount: players.filter((player) => player.status === 'matched').length,
      unresolvedPlayerCount,
      conflictCount,
    };
  });

  return {
    summary: {
      totalMatches: items.length,
      readyMatches: items.filter((item) => item.status === 'ready').length,
      duplicateMatches: items.filter((item) => item.status === 'duplicate').length,
      invalidMatches: items.filter((item) => item.status === 'invalid').length,
      matchedPlayers: items.reduce((sum, item) => sum + item.matchedPlayerCount, 0),
      unresolvedPlayers: items.reduce((sum, item) => sum + item.unresolvedPlayerCount, 0),
      conflicts: items.reduce((sum, item) => sum + item.conflictCount, 0),
    },
    items,
  } satisfies LegacyMatchImportPreview;
}

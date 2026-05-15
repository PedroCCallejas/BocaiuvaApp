import type { Lineup, LineupNode, LineupZone, MatchType, Player } from '@/types/domain';

export interface FormationPreset {
  key: string;
  label: string;
  matchType: MatchType;
  linePlayersCount: number;
  starterCount: number;
  coordinates: Array<{ x: number; y: number; zone: LineupZone }>;
}

export interface LineupLayoutState {
  formationKey: string;
  starters: LineupNode[];
  benchPlayerIds: string[];
}

const formationPresets: FormationPreset[] = [
  {
    key: 'futsal-2-2',
    label: '2-2',
    matchType: 'futsal',
    linePlayersCount: 4,
    starterCount: 5,
    coordinates: [
      { x: 50, y: 90, zone: 'goalkeeper' },
      { x: 28, y: 62, zone: 'defense' },
      { x: 72, y: 62, zone: 'defense' },
      { x: 32, y: 30, zone: 'attack' },
      { x: 68, y: 30, zone: 'attack' },
    ],
  },
  {
    key: 'society-2-2-1',
    label: '2-2-1',
    matchType: 'training',
    linePlayersCount: 5,
    starterCount: 6,
    coordinates: [
      { x: 50, y: 90, zone: 'goalkeeper' },
      { x: 33, y: 66, zone: 'defense' },
      { x: 67, y: 66, zone: 'defense' },
      { x: 33, y: 42, zone: 'midfield' },
      { x: 67, y: 42, zone: 'midfield' },
      { x: 50, y: 18, zone: 'attack' },
    ],
  },
  {
    key: 'society-3-2-1',
    label: '3-2-1',
    matchType: 'society',
    linePlayersCount: 6,
    starterCount: 7,
    coordinates: [
      { x: 50, y: 90, zone: 'goalkeeper' },
      { x: 22, y: 68, zone: 'defense' },
      { x: 50, y: 66, zone: 'defense' },
      { x: 78, y: 68, zone: 'defense' },
      { x: 35, y: 42, zone: 'midfield' },
      { x: 65, y: 42, zone: 'midfield' },
      { x: 50, y: 18, zone: 'attack' },
    ],
  },
  {
    key: 'society-2-3-1',
    label: '2-3-1',
    matchType: 'society',
    linePlayersCount: 6,
    starterCount: 7,
    coordinates: [
      { x: 50, y: 90, zone: 'goalkeeper' },
      { x: 35, y: 68, zone: 'defense' },
      { x: 65, y: 68, zone: 'defense' },
      { x: 22, y: 44, zone: 'midfield' },
      { x: 50, y: 40, zone: 'midfield' },
      { x: 78, y: 44, zone: 'midfield' },
      { x: 50, y: 18, zone: 'attack' },
    ],
  },
  {
    key: 'field-4-3-3',
    label: '4-3-3',
    matchType: 'field',
    linePlayersCount: 10,
    starterCount: 11,
    coordinates: [
      { x: 50, y: 92, zone: 'goalkeeper' },
      { x: 16, y: 72, zone: 'defense' },
      { x: 38, y: 74, zone: 'defense' },
      { x: 62, y: 74, zone: 'defense' },
      { x: 84, y: 72, zone: 'defense' },
      { x: 25, y: 50, zone: 'midfield' },
      { x: 50, y: 44, zone: 'midfield' },
      { x: 75, y: 50, zone: 'midfield' },
      { x: 20, y: 20, zone: 'attack' },
      { x: 50, y: 14, zone: 'attack' },
      { x: 80, y: 20, zone: 'attack' },
    ],
  },
];

function fallbackCoordinates(starterCount: number) {
  const rows = Math.min(Math.max(starterCount - 1, 1), 4);
  const result: Array<{ x: number; y: number; zone: LineupZone }> = [
    { x: 50, y: 90, zone: 'goalkeeper' },
  ];

  if (starterCount === 1) {
    return result;
  }

  const remaining = starterCount - 1;
  const perRow = Math.ceil(remaining / rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < perRow; col += 1) {
      if (result.length >= starterCount) {
        break;
      }

      const x = (100 / (perRow + 1)) * (col + 1);
      const y = 72 - row * 18;
      result.push({
        x,
        y,
        zone: row === rows - 1 ? 'attack' : row >= 1 ? 'midfield' : 'defense',
      });
    }
  }

  return result;
}

function buildAdaptiveFormationLabel(linePlayersCount: number) {
  if (linePlayersCount <= 2) {
    return String(linePlayersCount);
  }

  const attackLine = Math.max(1, Math.round(linePlayersCount / 3));
  const defenseLine = Math.max(1, Math.round(linePlayersCount / 3));
  const midfieldLine = Math.max(1, linePlayersCount - attackLine - defenseLine);
  const lines = [defenseLine, midfieldLine, attackLine].filter((value) => value > 0);

  return lines.join('-');
}

function buildAdaptiveFormationPreset(
  matchType: MatchType,
  linePlayersCount: number,
): FormationPreset {
  const starterCount = linePlayersCount + 1;

  return {
    key: `custom-${matchType}-${linePlayersCount}`,
    label: buildAdaptiveFormationLabel(linePlayersCount),
    matchType,
    linePlayersCount,
    starterCount,
    coordinates: fallbackCoordinates(starterCount),
  };
}

export function getFormationPresets(matchType: MatchType, linePlayersCount: number) {
  const matching = formationPresets.filter(
    (preset) =>
      preset.linePlayersCount === linePlayersCount && preset.matchType === matchType,
  );

  if (matching.length > 0) {
    return matching;
  }

  const compatibleByCount = formationPresets.filter(
    (preset) => preset.linePlayersCount === linePlayersCount,
  );

  if (compatibleByCount.length > 0) {
    return compatibleByCount;
  }

  return [buildAdaptiveFormationPreset(matchType, linePlayersCount)];
}

export function buildLineupFromPreset(
  preset: FormationPreset,
  players: Player[],
): { starters: LineupNode[]; benchPlayerIds: string[] } {
  const coordinates =
    preset.coordinates.length >= preset.starterCount
      ? preset.coordinates
      : fallbackCoordinates(preset.starterCount);

  return {
    starters: players.slice(0, preset.starterCount).map((player, index) => ({
      playerId: player.id,
      x: coordinates[index]?.x ?? 50,
      y: coordinates[index]?.y ?? 50,
      zone: coordinates[index]?.zone ?? 'midfield',
      label: null,
    })),
    benchPlayerIds: players.slice(preset.starterCount).map((player) => player.id),
  };
}

function clampPercent(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Number(Math.min(Math.max(value, 0), 100).toFixed(1));
}

export function inferLineupZone(y: number): LineupZone {
  if (y >= 82) {
    return 'goalkeeper';
  }

  if (y >= 58) {
    return 'defense';
  }

  if (y >= 34) {
    return 'midfield';
  }

  return 'attack';
}

export function buildLineupStateFromSource(params: {
  existingLineup?: Pick<Lineup, 'formationKey' | 'starters' | 'benchPlayerIds'> | null;
  preset: FormationPreset;
  players: Player[];
}): LineupLayoutState {
  const autoLineup = buildLineupFromPreset(params.preset, params.players);
  if (!params.existingLineup) {
    return {
      formationKey: params.preset.key,
      starters: autoLineup.starters,
      benchPlayerIds: autoLineup.benchPlayerIds,
    };
  }

  const availablePlayerIds = new Set(params.players.map((player) => player.id));
  const normalizedFallbackCoordinates =
    params.preset.coordinates.length >= params.preset.starterCount
      ? params.preset.coordinates
      : fallbackCoordinates(params.preset.starterCount);
  const usedPlayerIds = new Set<string>();
  const starters = params.existingLineup.starters
    .flatMap((node, index) => {
      if (!availablePlayerIds.has(node.playerId) || usedPlayerIds.has(node.playerId)) {
        return [];
      }

      usedPlayerIds.add(node.playerId);
      const fallback = normalizedFallbackCoordinates[index] ?? {
        x: 50,
        y: 50,
        zone: 'midfield' as const,
      };

      return [{
        playerId: node.playerId,
        x: clampPercent(node.x, fallback.x),
        y: clampPercent(node.y, fallback.y),
        zone: node.zone ?? inferLineupZone(clampPercent(node.y, fallback.y)),
        label: node.label?.trim() || null,
      } satisfies LineupNode];
    })
    .slice(0, params.preset.starterCount);

  const benchSet = new Set<string>();
  const benchPlayerIds: string[] = [];

  for (const playerId of params.existingLineup.benchPlayerIds ?? []) {
    if (
      availablePlayerIds.has(playerId) &&
      !usedPlayerIds.has(playerId) &&
      !benchSet.has(playerId)
    ) {
      benchSet.add(playerId);
      benchPlayerIds.push(playerId);
    }
  }

  for (const player of params.players) {
    if (!usedPlayerIds.has(player.id) && !benchSet.has(player.id)) {
      benchSet.add(player.id);
      benchPlayerIds.push(player.id);
    }
  }

  return {
    formationKey: params.existingLineup.formationKey || params.preset.key,
    starters,
    benchPlayerIds,
  };
}

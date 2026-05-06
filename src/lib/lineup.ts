import type { LineupNode, LineupZone, MatchType, Player } from '@/types/domain';

export interface FormationPreset {
  key: string;
  label: string;
  matchType: MatchType;
  linePlayersCount: number;
  starterCount: number;
  coordinates: Array<{ x: number; y: number; zone: LineupZone }>;
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

export function getFormationPresets(matchType: MatchType, linePlayersCount: number) {
  const matching = formationPresets.filter(
    (preset) =>
      preset.linePlayersCount === linePlayersCount && preset.matchType === matchType,
  );

  if (matching.length > 0) {
    return matching;
  }

  return formationPresets.filter((preset) => preset.linePlayersCount === linePlayersCount);
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
    })),
    benchPlayerIds: players.slice(preset.starterCount).map((player) => player.id),
  };
}

import type { Lineup, MatchStatus, Player } from '@/types/domain';
import type { LineupLayoutState } from '@/lib/lineup';

export function canEditMatchLineup(canManage: boolean, status?: MatchStatus) {
  return canManage && (status === 'scheduled' || status === 'confirmed');
}

// Publication is a snapshot. Never sanitize it against today's attendance.
export function getPublishedLineup(lineup?: Pick<Lineup, 'formationKey' | 'starters' | 'benchPlayerIds'> | null): LineupLayoutState | null {
  if (!lineup) return null;
  return {
    formationKey: lineup.formationKey ?? '',
    starters: lineup.starters.map((node) => ({ ...node })),
    benchPlayerIds: [...lineup.benchPlayerIds],
  };
}

export function canSharePublishedLineup({ lineup, players, hasUnsavedChanges, ready }: {
  lineup: LineupLayoutState | null;
  players: Pick<Player, 'id'>[];
  hasUnsavedChanges: boolean;
  ready: boolean;
}) {
  if (!ready || hasUnsavedChanges || !lineup?.starters.length) return false;
  const available = new Set(players.map((player) => player.id));
  return [...lineup.starters.map((node) => node.playerId), ...lineup.benchPlayerIds]
    .every((id) => available.has(id));
}

export function getLineupPresentation<T extends Pick<Player, 'id'>>(params: {
  canEdit: boolean; hasUnsavedChanges: boolean; draft: LineupLayoutState;
  published: LineupLayoutState | null; confirmedPlayers: T[]; publishedPlayers: T[];
}) {
  const editing = params.canEdit && params.hasUnsavedChanges;
  return {
    editing,
    lineup: editing ? params.draft : (params.published ?? params.draft),
    players: editing ? params.confirmedPlayers : params.publishedPlayers,
  };
}

// Pure logic for pickup (pelada) tools: sorteador and rodízio.
// No React or side effects — fully testable.

export type PotNumber = 1 | 2 | 3 | 4;

export type PlayerWithPot = {
  name: string;
  pot: PotNumber;
};

export type SortResult = {
  teams: string[][];
  reservas: string[];
};

export type RodizioState = {
  teamA: string[];
  teamB: string[];
  // FIFO queue of individual players waiting to play
  waitingPlayers: string[];
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Sort random: shuffle then fill teams of exactly perTeam; overflow → reservas
export function sortRandomly(players: string[], perTeam: number): SortResult {
  if (players.length < 2 || perTeam < 1) return { teams: [], reservas: [] };
  const shuffled = shuffle(players);
  const teamCount = Math.floor(shuffled.length / perTeam);
  if (teamCount < 1) return { teams: [], reservas: shuffled };
  const needed = teamCount * perTeam;
  const teams: string[][] = [];
  for (let i = 0; i < needed; i += perTeam) {
    teams.push(shuffled.slice(i, i + perTeam));
  }
  return { teams, reservas: shuffled.slice(needed) };
}

// Sort by pots: distribute using round-robin so each team gets ~equal pots.
// Players are ordered pot1→pot2→pot3→pot4, shuffled within each pot.
// Round-robin i%teamCount ensures balanced distribution.
export function sortByPots(players: PlayerWithPot[], perTeam: number): SortResult {
  if (players.length < 2 || perTeam < 1) return { teams: [], reservas: [] };
  const teamCount = Math.floor(players.length / perTeam);
  if (teamCount < 1) return { teams: [], reservas: players.map((p) => p.name) };

  // Group by pot, shuffle within each pot
  const byPot: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of players) {
    byPot[p.pot].push(p.name);
  }
  for (const pot of [1, 2, 3, 4]) {
    byPot[pot] = shuffle(byPot[pot]);
  }

  // Flatten in pot order
  const ordered = [...byPot[1], ...byPot[2], ...byPot[3], ...byPot[4]];

  // Create empty teams
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  const maxPlayers = teamCount * perTeam;
  const reservas: string[] = [];

  for (let i = 0; i < ordered.length; i++) {
    if (i < maxPlayers) {
      teams[i % teamCount].push(ordered[i]);
    } else {
      reservas.push(ordered[i]);
    }
  }

  return { teams, reservas };
}

// Rodízio: initialize from a flat ordered list of player names.
// First perTeam → teamA, next perTeam → teamB, rest → waitingPlayers (FIFO).
export function initRodizio(players: string[], perTeam: number): RodizioState {
  if (players.length < perTeam * 2) {
    return { teamA: players.slice(0, perTeam), teamB: [], waitingPlayers: [] };
  }
  return {
    teamA: players.slice(0, perTeam),
    teamB: players.slice(perTeam, perTeam * 2),
    waitingPlayers: players.slice(perTeam * 2),
  };
}

// Rodízio: register match winner.
// Winner stays. Loser players go to END of waitingPlayers.
// Next team = first perTeam from the updated waitingPlayers.
// If queue has fewer than perTeam, forms a partial team with whoever is there.
export function registerRodizioWin(
  state: RodizioState,
  winner: 'A' | 'B',
  perTeam: number,
): RodizioState {
  const winnerTeam = winner === 'A' ? state.teamA : state.teamB;
  const loserTeam = winner === 'A' ? state.teamB : state.teamA;

  // Loser players join end of queue
  const newWaiting = [...state.waitingPlayers, ...loserTeam];

  if (newWaiting.length === 0) {
    // No one to challenge — loser stays as opponent
    return { teamA: winnerTeam, teamB: loserTeam, waitingPlayers: [] };
  }

  const nextTeam = newWaiting.slice(0, perTeam);
  const remainingWaiting = newWaiting.slice(perTeam);

  return {
    teamA: winnerTeam,
    teamB: nextTeam,
    waitingPlayers: remainingWaiting,
  };
}

// Group waitingPlayers into visual "teams" of perTeam for display purposes
export function getQueuedTeams(waitingPlayers: string[], perTeam: number): string[][] {
  if (perTeam < 1 || waitingPlayers.length === 0) return [];
  const result: string[][] = [];
  for (let i = 0; i < waitingPlayers.length; i += perTeam) {
    result.push(waitingPlayers.slice(i, i + perTeam));
  }
  return result;
}

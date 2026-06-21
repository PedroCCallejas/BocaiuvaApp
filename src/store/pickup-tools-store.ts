import { create } from 'zustand';

import {
  type RodizioState,
  addPlayerToQueue,
  initRodizio,
  registerRodizioWin,
  removePlayerFromActiveTeam,
  removePlayerFromQueue,
} from '@/lib/pickup-tools';

// Timer state uses timestamps so the displayed time is always accurate
// even when the user navigates away, refreshes, or returns after a while.
interface TimerState {
  durationMs: number;
  // Ms remaining at the moment the timer was last paused (or at start)
  remainingMsWhenPaused: number;
  // Date.now() value when the timer last started running; null if paused
  startedAt: number | null;
  isRunning: boolean;
  teamAScore: number;
  teamBScore: number;
  goalLimit: number; // 0 = no limit
  winner: 'A' | 'B' | 'draw' | null;
}

interface RodizioSlice extends RodizioState {
  players: string[];
  playersPerTeam: number;
  phase: 'setup' | 'playing';
  matchCount: number;
  // Players marked to leave after the current match ends (stay in team visually until then)
  leavingAfterMatch: string[];
}

interface PickupToolsState extends TimerState, RodizioSlice {
  storageWasRead: boolean;

  // Timer actions
  configureTimer(durationMs: number, goalLimit: number): void;
  startTimer(): void;
  pauseTimer(): void;
  resetTimer(): void;
  addGoal(team: 'A' | 'B'): void;

  // Rodízio actions
  setRodizioPlayers(players: string[]): void;
  setRodizioPlayersPerTeam(n: number): void;
  startRodizio(): void;
  registerWin(winner: 'A' | 'B'): void;
  resetRodizio(): void;

  // Removal during active session
  removeFromQueue(player: string): void;
  removeFromActiveTeam(player: string, mode: 'now' | 'afterMatch'): void;
  addPlayerDuringActive(player: string): void;

  // Full reset: clears both timer and rodízio, then removes localStorage entry
  resetAll(): void;
}

// Only data fields are persisted (no functions)
export interface PersistedState {
  durationMs: number;
  remainingMsWhenPaused: number;
  startedAt: number | null;
  isRunning: boolean;
  teamAScore: number;
  teamBScore: number;
  goalLimit: number;
  winner: 'A' | 'B' | 'draw' | null;
  players: string[];
  playersPerTeam: number;
  teamA: string[];
  teamB: string[];
  waitingPlayers: string[];
  phase: 'setup' | 'playing';
  matchCount: number;
  leavingAfterMatch: string[];
}

export const TIMER_DEFAULTS: TimerState = {
  durationMs: 10 * 60 * 1000,
  remainingMsWhenPaused: 10 * 60 * 1000,
  startedAt: null,
  isRunning: false,
  teamAScore: 0,
  teamBScore: 0,
  goalLimit: 2,
  winner: null,
};

export const RODIZIO_DEFAULTS: RodizioSlice = {
  players: [],
  playersPerTeam: 5,
  teamA: [],
  teamB: [],
  waitingPlayers: [],
  phase: 'setup',
  matchCount: 0,
  leavingAfterMatch: [],
};

export const PICKUP_TOOLS_STORAGE_KEY = 'professo-pickup-tools';

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem' | 'removeItem'>;
type StorageLike = StorageReader & StorageWriter;

export interface LoadStoredStateResult {
  state: Partial<PersistedState>;
  storageWasRead: boolean;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizeStoredState(raw: unknown): Partial<PersistedState> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const value = raw as Record<string, unknown>;
  const sanitized: Partial<PersistedState> = {};

  if (isFiniteNumber(value.durationMs) && value.durationMs > 0) {
    sanitized.durationMs = value.durationMs;
  }

  if (isFiniteNumber(value.remainingMsWhenPaused) && value.remainingMsWhenPaused >= 0) {
    sanitized.remainingMsWhenPaused = value.remainingMsWhenPaused;
  }

  if (value.startedAt === null || isFiniteNumber(value.startedAt)) {
    sanitized.startedAt = value.startedAt as number | null;
  }

  if (typeof value.isRunning === 'boolean') {
    sanitized.isRunning = value.isRunning;
  }

  if (isFiniteNumber(value.teamAScore) && value.teamAScore >= 0) {
    sanitized.teamAScore = value.teamAScore;
  }

  if (isFiniteNumber(value.teamBScore) && value.teamBScore >= 0) {
    sanitized.teamBScore = value.teamBScore;
  }

  if (isFiniteNumber(value.goalLimit) && value.goalLimit >= 0) {
    sanitized.goalLimit = value.goalLimit;
  }

  if (value.winner === null || value.winner === 'A' || value.winner === 'B' || value.winner === 'draw') {
    sanitized.winner = value.winner as PersistedState['winner'];
  }

  if (isStringArray(value.players)) {
    sanitized.players = value.players;
  }

  if (isFiniteNumber(value.playersPerTeam) && value.playersPerTeam >= 1) {
    sanitized.playersPerTeam = value.playersPerTeam;
  }

  if (isStringArray(value.teamA)) {
    sanitized.teamA = value.teamA;
  }

  if (isStringArray(value.teamB)) {
    sanitized.teamB = value.teamB;
  }

  if (isStringArray(value.waitingPlayers)) {
    sanitized.waitingPlayers = value.waitingPlayers;
  }

  if (value.phase === 'setup' || value.phase === 'playing') {
    sanitized.phase = value.phase;
  }

  if (isFiniteNumber(value.matchCount) && value.matchCount >= 0) {
    sanitized.matchCount = value.matchCount;
  }

  if (isStringArray(value.leavingAfterMatch)) {
    sanitized.leavingAfterMatch = value.leavingAfterMatch;
  }

  return sanitized;
}

function buildDefaultPersistedState(): PersistedState {
  return {
    ...TIMER_DEFAULTS,
    ...RODIZIO_DEFAULTS,
  };
}

function pickPersistedState(
  state: Pick<
    PickupToolsState,
    | 'durationMs'
    | 'remainingMsWhenPaused'
    | 'startedAt'
    | 'isRunning'
    | 'teamAScore'
    | 'teamBScore'
    | 'goalLimit'
    | 'winner'
    | 'players'
    | 'playersPerTeam'
    | 'teamA'
    | 'teamB'
    | 'waitingPlayers'
    | 'phase'
    | 'matchCount'
    | 'leavingAfterMatch'
  >,
): PersistedState {
  return {
    durationMs: state.durationMs,
    remainingMsWhenPaused: state.remainingMsWhenPaused,
    startedAt: state.startedAt,
    isRunning: state.isRunning,
    teamAScore: state.teamAScore,
    teamBScore: state.teamBScore,
    goalLimit: state.goalLimit,
    winner: state.winner,
    players: state.players,
    playersPerTeam: state.playersPerTeam,
    teamA: state.teamA,
    teamB: state.teamB,
    waitingPlayers: state.waitingPlayers,
    phase: state.phase,
    matchCount: state.matchCount,
    leavingAfterMatch: state.leavingAfterMatch,
  };
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function persistedStatesEqual(left: PersistedState, right: PersistedState): boolean {
  return (
    left.durationMs === right.durationMs &&
    left.remainingMsWhenPaused === right.remainingMsWhenPaused &&
    left.startedAt === right.startedAt &&
    left.isRunning === right.isRunning &&
    left.teamAScore === right.teamAScore &&
    left.teamBScore === right.teamBScore &&
    left.goalLimit === right.goalLimit &&
    left.winner === right.winner &&
    left.playersPerTeam === right.playersPerTeam &&
    left.phase === right.phase &&
    left.matchCount === right.matchCount &&
    arraysEqual(left.players, right.players) &&
    arraysEqual(left.teamA, right.teamA) &&
    arraysEqual(left.teamB, right.teamB) &&
    arraysEqual(left.waitingPlayers, right.waitingPlayers) &&
    arraysEqual(left.leavingAfterMatch, right.leavingAfterMatch)
  );
}

export function loadStoredState(storage: StorageReader | null = getBrowserStorage()): LoadStoredStateResult {
  if (!storage) {
    return {
      state: {},
      storageWasRead: false,
    };
  }

  try {
    const raw = storage.getItem(PICKUP_TOOLS_STORAGE_KEY);

    if (!raw) {
      return {
        state: {},
        storageWasRead: true,
      };
    }

    return {
      state: sanitizeStoredState(JSON.parse(raw)),
      storageWasRead: true,
    };
  } catch {
    return {
      state: {},
      storageWasRead: true,
    };
  }
}

function saveStoredState(state: PickupToolsState): void {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.setItem(PICKUP_TOOLS_STORAGE_KEY, JSON.stringify(pickPersistedState(state)));
  } catch {
    // ignore write errors (private/incognito mode, quota exceeded)
  }
}

function clearStoredState(): void {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.removeItem(PICKUP_TOOLS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const initialStoredSnapshot = loadStoredState();
const initialPersistedState = {
  ...buildDefaultPersistedState(),
  ...initialStoredSnapshot.state,
};

export const usePickupToolsStore = create<PickupToolsState>()((set, get) => ({
  ...initialPersistedState,
  storageWasRead: initialStoredSnapshot.storageWasRead,

  configureTimer(durationMs, goalLimit) {
    set({
      durationMs,
      remainingMsWhenPaused: durationMs,
      goalLimit,
      startedAt: null,
      isRunning: false,
      teamAScore: 0,
      teamBScore: 0,
      winner: null,
    });
  },

  startTimer() {
    const { winner, isRunning } = get();
    if (winner !== null || isRunning) return;
    set({ isRunning: true, startedAt: Date.now() });
  },

  pauseTimer() {
    const { isRunning, startedAt, remainingMsWhenPaused } = get();
    if (!isRunning || startedAt === null) return;
    const elapsed = Date.now() - startedAt;
    set({
      isRunning: false,
      startedAt: null,
      remainingMsWhenPaused: Math.max(0, remainingMsWhenPaused - elapsed),
    });
  },

  resetTimer() {
    const { durationMs, goalLimit } = get();
    set({
      ...TIMER_DEFAULTS,
      durationMs,
      remainingMsWhenPaused: durationMs,
      goalLimit,
    });
  },

  addGoal(team) {
    const { winner, teamAScore, teamBScore, goalLimit, remainingMsWhenPaused, startedAt, isRunning } = get();
    if (winner !== null) return;

    const nextA = team === 'A' ? teamAScore + 1 : teamAScore;
    const nextB = team === 'B' ? teamBScore + 1 : teamBScore;

    // Freeze remaining time if game ends by goal
    let frozenRemaining = remainingMsWhenPaused;
    if (isRunning && startedAt !== null) {
      frozenRemaining = Math.max(0, remainingMsWhenPaused - (Date.now() - startedAt));
    }

    const hitLimit = goalLimit > 0 && (nextA >= goalLimit || nextB >= goalLimit);
    const gameWinner = hitLimit
      ? nextA > nextB
        ? 'A'
        : nextB > nextA
          ? 'B'
          : 'draw'
      : null;

    set({
      teamAScore: nextA,
      teamBScore: nextB,
      ...(hitLimit
        ? {
            winner: gameWinner,
            isRunning: false,
            startedAt: null,
            remainingMsWhenPaused: frozenRemaining,
          }
        : {}),
    });
  },

  setRodizioPlayers(players) {
    set({ players, phase: 'setup' });
  },

  setRodizioPlayersPerTeam(n) {
    set({ playersPerTeam: n });
  },

  startRodizio() {
    const { players, playersPerTeam } = get();
    const state = initRodizio(players, playersPerTeam);
    set({ ...state, phase: 'playing', matchCount: 0, leavingAfterMatch: [] });
  },

  registerWin(winner) {
    const { teamA, teamB, waitingPlayers, playersPerTeam, matchCount, leavingAfterMatch } = get();
    const newState = registerRodizioWin(
      { teamA, teamB, waitingPlayers },
      winner,
      playersPerTeam,
      leavingAfterMatch,
    );
    set({ ...newState, matchCount: matchCount + 1, leavingAfterMatch: [] });
  },

  resetRodizio() {
    set({ ...RODIZIO_DEFAULTS });
  },

  removeFromQueue(player) {
    const { teamA, teamB, waitingPlayers } = get();
    const newState = removePlayerFromQueue({ teamA, teamB, waitingPlayers }, player);
    set({ waitingPlayers: newState.waitingPlayers });
  },

  removeFromActiveTeam(player, mode) {
    if (mode === 'afterMatch') {
      const { leavingAfterMatch } = get();
      if (!leavingAfterMatch.includes(player)) {
        set({ leavingAfterMatch: [...leavingAfterMatch, player] });
      }
      return;
    }
    // 'now': remove player immediately and pull replacement from queue if available
    const { teamA, teamB, waitingPlayers } = get();
    const { state: newState } = removePlayerFromActiveTeam(
      { teamA, teamB, waitingPlayers },
      player,
      true,
    );
    set({ teamA: newState.teamA, teamB: newState.teamB, waitingPlayers: newState.waitingPlayers });
  },

  addPlayerDuringActive(player) {
    const { teamA, teamB, waitingPlayers } = get();
    const allPlayers = [...teamA, ...teamB, ...waitingPlayers];
    if (allPlayers.includes(player)) return;
    const newState = addPlayerToQueue({ teamA, teamB, waitingPlayers }, player);
    set({ waitingPlayers: newState.waitingPlayers });
  },

  resetAll() {
    set({ ...TIMER_DEFAULTS, ...RODIZIO_DEFAULTS });
    clearStoredState();
  },
}));

export function rehydratePickupToolsState(
  storage: StorageReader | null = getBrowserStorage(),
): LoadStoredStateResult & { restored: boolean } {
  const loaded = loadStoredState(storage);
  const hasStoredData = Object.keys(loaded.state).length > 0;
  const nextPersistedState = {
    ...buildDefaultPersistedState(),
    ...loaded.state,
  };

  usePickupToolsStore.setState((currentState) => {
    const currentPersistedState = pickPersistedState(currentState);
    const shouldRestore =
      hasStoredData && !persistedStatesEqual(currentPersistedState, nextPersistedState);
    const shouldMarkRead = currentState.storageWasRead !== loaded.storageWasRead;

    if (!shouldRestore && !shouldMarkRead) {
      return currentState;
    }

    return {
      ...currentState,
      ...(shouldRestore ? nextPersistedState : {}),
      storageWasRead: loaded.storageWasRead,
    };
  });

  return {
    ...loaded,
    restored: hasStoredData,
  };
}

// Persist every state change to localStorage
usePickupToolsStore.subscribe((state) => saveStoredState(state));

// Helper to compute current remaining ms from store state (call in component render/effect)
export function computeRemainingMs(
  state: Pick<TimerState, 'isRunning' | 'startedAt' | 'remainingMsWhenPaused' | 'winner'>,
): number {
  if (state.winner !== null) return 0;
  if (!state.isRunning || state.startedAt === null) return state.remainingMsWhenPaused;
  return Math.max(0, state.remainingMsWhenPaused - (Date.now() - state.startedAt));
}

export function hasActiveRodizio(
  state: Pick<RodizioSlice, 'phase' | 'teamA' | 'teamB'>,
): boolean {
  return state.phase === 'playing' && state.teamA.length > 0 && state.teamB.length > 0;
}

// True if there is any active session that was persisted (timer or rodízio in progress)
export function hasActiveSession(
  state: Pick<TimerState, 'isRunning' | 'remainingMsWhenPaused' | 'durationMs' | 'winner'> &
    Pick<RodizioSlice, 'phase' | 'teamA' | 'teamB'>,
): boolean {
  if (hasActiveRodizio(state)) return true;
  if (state.winner !== null) return true;
  if (state.isRunning) return true;
  if (state.remainingMsWhenPaused < state.durationMs) return true;
  return false;
}

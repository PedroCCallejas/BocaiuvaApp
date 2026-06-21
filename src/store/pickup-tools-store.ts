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
interface PersistedState {
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

const STORAGE_KEY = 'professo-pickup-tools';

function loadStoredState(): Partial<PersistedState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

function saveStoredState(state: PickupToolsState): void {
  if (typeof window === 'undefined') return;
  try {
    const data: PersistedState = {
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore write errors (private/incognito mode, quota exceeded)
  }
}

function clearStoredState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const savedState = loadStoredState();

export const usePickupToolsStore = create<PickupToolsState>()((set, get) => ({
  ...TIMER_DEFAULTS,
  ...RODIZIO_DEFAULTS,
  ...savedState,

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

// True if there is any active session that was persisted (timer or rodízio in progress)
export function hasActiveSession(
  state: Pick<TimerState, 'isRunning' | 'remainingMsWhenPaused' | 'durationMs' | 'winner'> &
    Pick<RodizioSlice, 'phase'>,
): boolean {
  if (state.phase === 'playing') return true;
  if (state.winner !== null) return true;
  if (state.isRunning) return true;
  if (state.remainingMsWhenPaused < state.durationMs) return true;
  return false;
}

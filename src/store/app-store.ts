import { create } from 'zustand';
import Constants from 'expo-constants';

import { authService } from '@/services/auth';
import type { AuthSessionUser } from '@/services/auth';
import {
  clearCurrentUserPushToken,
  syncCurrentUserPushToken,
} from '@/services/notifications';
import { repository } from '@/services/repository';
import { emptySnapshot } from '@/services/repository/types';
import type {
  AppSnapshot,
  CreateMatchInput,
  CreateMatchDiaryEntryInput,
  CreatePlayerInput,
  CreateRatingCriterionInput,
  CreateTeamInput,
  FinishMatchInput,
  GoogleLoginInput,
  RegisterFinishedMatchInput,
  LoginInput,
  RegisterInput,
  SaveLineupInput,
  SubmitMvpVoteInput,
  SubmitPlayerRatingInput,
  UpdateMatchInput,
  UpdateMatchDiaryEntryInput,
  UpdateRatingCriterionInput,
  UpdateTeamInput,
  UpdateAttendanceInput,
  UpdatePlayerInput,
} from '@/services/repository/types';
import type {
  ImportLegacyMatchesResult,
  ImportedMatchPayloadItem,
  LegacyMatchImportPreview,
} from '@/types/match-import';
import type { Team } from '@/types/domain';

type SyncStatus = 'idle' | 'connecting' | 'refreshing';

export interface AppState {
  ready: boolean;
  backendMode: 'mock' | 'firebase';
  currentUserId: string | null;
  snapshot: AppSnapshot;
  syncStatus: SyncStatus;
  hasLiveSync: boolean;
  lastSyncedAt: string | null;
  bootstrap: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  loginWithGoogle: (input: GoogleLoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshData: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  createTeam: (input: CreateTeamInput) => Promise<Team>;
  updateTeam: (teamId: string, input: UpdateTeamInput) => Promise<void>;
  regenerateTeamInviteCode: (teamId: string) => Promise<string>;
  createRatingCriterion: (input: CreateRatingCriterionInput) => Promise<void>;
  updateRatingCriterion: (criterionId: string, input: UpdateRatingCriterionInput) => Promise<void>;
  deleteRatingCriterion: (criterionId: string) => Promise<void>;
  setActiveTeam: (teamId: string) => Promise<void>;
  joinTeamWithInviteCode: (inviteCode: string) => Promise<{ alreadyMember: boolean }>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  createPlayer: (input: CreatePlayerInput) => Promise<string>;
  updatePlayer: (playerId: string, input: UpdatePlayerInput) => Promise<void>;
  removePlayer: (playerId: string) => Promise<void>;
  reactivatePlayer: (playerId: string) => Promise<void>;
  createMatch: (input: CreateMatchInput) => Promise<string>;
  updateMatch: (matchId: string, input: UpdateMatchInput) => Promise<void>;
  setAttendance: (input: UpdateAttendanceInput) => Promise<void>;
  saveLineup: (input: SaveLineupInput) => Promise<void>;
  finishMatch: (input: FinishMatchInput) => Promise<void>;
  registerFinishedMatch: (input: RegisterFinishedMatchInput) => Promise<string>;
  previewLegacyMatchImport: (
    payload: ImportedMatchPayloadItem[],
  ) => Promise<LegacyMatchImportPreview>;
  importLegacyMatches: (
    payload: ImportedMatchPayloadItem[],
  ) => Promise<ImportLegacyMatchesResult>;
  createMatchDiaryEntry: (input: CreateMatchDiaryEntryInput) => Promise<string>;
  updateMatchDiaryEntry: (
    entryId: string,
    input: UpdateMatchDiaryEntryInput,
  ) => Promise<void>;
  deleteMatchDiaryEntry: (entryId: string) => Promise<void>;
  submitMvpVote: (input: SubmitMvpVoteInput) => Promise<void>;
  submitPlayerRating: (input: SubmitPlayerRatingInput) => Promise<void>;
}

type StoreSet = (partial: Partial<AppState>) => void;
type StoreGet = () => AppState;

let authSubscription: (() => void) | null = null;
let realtimeSubscription: (() => void) | null = null;
let realtimeUserId: string | null = null;
let realtimeGeneration = 0;
let lastSnapshotKey = JSON.stringify(emptySnapshot);
let lastPushTokenSyncUserId: string | null = null;

function resolveCurrentUserId(sessionUser: AuthSessionUser | null) {
  return sessionUser?.authId ?? null;
}

function nowIso() {
  return new Date().toISOString();
}

function buildSnapshotKey(snapshot: AppSnapshot) {
  return JSON.stringify(snapshot);
}

function applySnapshot(
  set: StoreSet,
  get: StoreGet,
  snapshot: AppSnapshot,
  currentUserId: string | null,
) {
  const nextKey = buildSnapshotKey(snapshot);
  const currentState = get();
  const hasChanged =
    nextKey !== lastSnapshotKey || currentState.currentUserId !== currentUserId;

  if (!hasChanged) {
    return false;
  }

  lastSnapshotKey = nextKey;
  set({
    snapshot,
    currentUserId,
    lastSyncedAt: currentUserId ? nowIso() : null,
    ready: true,
  });
  return true;
}

function resetSnapshot(set: StoreSet) {
  lastSnapshotKey = buildSnapshotKey(emptySnapshot);
  set({
    snapshot: emptySnapshot,
    currentUserId: null,
    lastSyncedAt: null,
    ready: true,
  });
}

function resetRealtimeSubscription() {
  realtimeGeneration += 1;

  if (realtimeSubscription) {
    realtimeSubscription();
  }

  realtimeSubscription = null;
  realtimeUserId = null;
}

async function refreshSnapshot(
  set: StoreSet,
  get: StoreGet,
  sessionUser: AuthSessionUser | null,
  options?: { showRefreshing?: boolean },
) {
  const currentUserId = resolveCurrentUserId(sessionUser);

  if (!currentUserId) {
    resetRealtimeSubscription();
    resetSnapshot(set);
    set({ hasLiveSync: false, syncStatus: 'idle' });
    return;
  }

  if (options?.showRefreshing) {
    set({ syncStatus: 'refreshing' });
  }

  try {
    const snapshot = await repository.getSnapshot();
    applySnapshot(set, get, snapshot, currentUserId);
  } finally {
    if (options?.showRefreshing) {
      set({ syncStatus: 'idle' });
    }
  }
}

async function ensureRealtimeSubscription(
  set: StoreSet,
  get: StoreGet,
  sessionUser: AuthSessionUser | null,
) {
  const currentUserId = resolveCurrentUserId(sessionUser);

  if (!currentUserId || !repository.subscribeSnapshot) {
    resetRealtimeSubscription();
    set({ hasLiveSync: false, syncStatus: 'idle' });
    return;
  }

  if (realtimeSubscription && realtimeUserId === currentUserId) {
    return;
  }

  resetRealtimeSubscription();
  realtimeUserId = currentUserId;
  const currentGeneration = realtimeGeneration;
  set({ hasLiveSync: true, syncStatus: 'connecting' });

  try {
    const unsubscribe = await repository.subscribeSnapshot(currentUserId, {
      onSnapshot: (snapshot) => {
        if (currentGeneration !== realtimeGeneration || realtimeUserId !== currentUserId) {
          return;
        }

        applySnapshot(set, get, snapshot, currentUserId);
        set({
          hasLiveSync: true,
          syncStatus: get().syncStatus === 'refreshing' ? 'refreshing' : 'idle',
        });
      },
      onError: () => {
        if (currentGeneration !== realtimeGeneration || realtimeUserId !== currentUserId) {
          return;
        }

        set({
          hasLiveSync: false,
          syncStatus: 'idle',
        });
      },
    });

    if (currentGeneration !== realtimeGeneration || realtimeUserId !== currentUserId) {
      unsubscribe();
      return;
    }

    realtimeSubscription = unsubscribe;
  } catch (error) {
    if (currentGeneration === realtimeGeneration && realtimeUserId === currentUserId) {
      set({ hasLiveSync: false, syncStatus: 'idle' });
    }

    throw error;
  }
}

function ensureAuthSubscription(set: StoreSet, get: StoreGet) {
  if (authSubscription) {
    return;
  }

  authSubscription = authService.subscribe((sessionUser) => {
    void ensureRealtimeSubscription(set, get, sessionUser);
    void refreshSnapshot(set, get, sessionUser);
  });
}

async function refreshCurrentSession(
  set: StoreSet,
  get: StoreGet,
  options?: { showRefreshing?: boolean },
) {
  const sessionUser = authService.getCurrentUser() ?? (await authService.restoreSession());
  await ensureRealtimeSubscription(set, get, sessionUser);
  await refreshSnapshot(set, get, sessionUser, options);
}

async function syncPushTokenForUser(userId: string | null) {
  if (!userId || lastPushTokenSyncUserId === userId) {
    return;
  }

  if (Constants.appOwnership === 'expo') {
    if (__DEV__) {
      console.log('[PUSH] Expo Go detectado antes do sync');
    }
    return;
  }

  try {
    const token = await syncCurrentUserPushToken(userId);
    if (token) {
      lastPushTokenSyncUserId = userId;
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[push] failed to sync current user token.', error);
    }
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  backendMode: repository.getMode(),
  currentUserId: null,
  snapshot: emptySnapshot,
  syncStatus: 'idle',
  hasLiveSync: false,
  lastSyncedAt: null,

  async bootstrap() {
    if (get().ready) {
      ensureAuthSubscription(set, get);
      return;
    }

    const sessionUser = await authService.restoreSession();
    const currentUserId = resolveCurrentUserId(sessionUser);
    const snapshot = await repository.getInitialSnapshot();
    applySnapshot(set, get, snapshot, currentUserId);
    set({
      ready: true,
      backendMode: repository.getMode(),
      currentUserId,
    });
    ensureAuthSubscription(set, get);
    await ensureRealtimeSubscription(set, get, sessionUser);
    await syncPushTokenForUser(currentUserId);
  },

  async login(input) {
    await repository.login(input);
    await refreshCurrentSession(set, get);
    await syncPushTokenForUser(get().currentUserId);
  },

  async loginWithGoogle(input) {
    await repository.loginWithGoogle(input);
    await refreshCurrentSession(set, get);
    await syncPushTokenForUser(get().currentUserId);
  },

  async register(input) {
    await repository.register(input);
    await refreshCurrentSession(set, get);
    await syncPushTokenForUser(get().currentUserId);
  },

  async resetPassword(email) {
    await repository.resetPassword(email);
  },

  async logout() {
    const userId = get().currentUserId;
    if (userId) {
      try {
        await clearCurrentUserPushToken(userId);
      } catch (error) {
        if (__DEV__) {
          console.warn('[push] failed to clear current user token.', error);
        }
      }
    }

    await authService.logout();
    resetRealtimeSubscription();
    resetSnapshot(set);
    lastPushTokenSyncUserId = null;
    set({ hasLiveSync: false, syncStatus: 'idle' });
  },

  async refreshData() {
    await refreshCurrentSession(set, get, { showRefreshing: true });
    await syncPushTokenForUser(get().currentUserId);
  },

  async refreshAccess() {
    await refreshCurrentSession(set, get, { showRefreshing: true });
    await syncPushTokenForUser(get().currentUserId);
  },

  async createTeam(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const team = await repository.createTeam(input, userId);
    await refreshCurrentSession(set, get);
    return team;
  },

  async updateTeam(teamId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateTeam(teamId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async regenerateTeamInviteCode(teamId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const team = await repository.regenerateTeamInviteCode(teamId, userId);
    await refreshCurrentSession(set, get);
    return team.inviteCode;
  },

  async createRatingCriterion(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.createRatingCriterion(input, userId);
    await refreshCurrentSession(set, get);
  },

  async updateRatingCriterion(criterionId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateRatingCriterion(criterionId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async deleteRatingCriterion(criterionId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.deleteRatingCriterion(criterionId, userId);
    await refreshCurrentSession(set, get);
  },

  async setActiveTeam(teamId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.setActiveTeam(teamId, userId);
    await refreshCurrentSession(set, get);
  },

  async joinTeamWithInviteCode(inviteCode) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const result = await repository.joinTeamWithInviteCode(inviteCode, userId);
    await refreshCurrentSession(set, get);
    return { alreadyMember: result.alreadyMember };
  },

  async markNotificationAsRead(notificationId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.markNotificationAsRead(notificationId, userId);
    await refreshCurrentSession(set, get);
  },

  async markAllNotificationsAsRead() {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.markAllNotificationsAsRead(userId);
    await refreshCurrentSession(set, get);
  },

  async createPlayer(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const player = await repository.createPlayer(input, userId);
    await refreshCurrentSession(set, get);
    return player.id;
  },

  async updatePlayer(playerId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updatePlayer(playerId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async removePlayer(playerId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.removePlayer(playerId, userId);
    await refreshCurrentSession(set, get);
  },

  async reactivatePlayer(playerId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.reactivatePlayer(playerId, userId);
    await refreshCurrentSession(set, get);
  },

  async createMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const match = await repository.createMatch(input, userId);
    await refreshCurrentSession(set, get);
    return match.id;
  },

  async updateMatch(matchId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateMatch(matchId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async setAttendance(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateAttendance(input, userId);
    await refreshCurrentSession(set, get);
  },

  async saveLineup(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.saveLineup(input, userId);
    await refreshCurrentSession(set, get);
  },

  async finishMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.finishMatch(input, userId);
    await refreshCurrentSession(set, get);
  },

  async registerFinishedMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const match = await repository.registerFinishedMatch(input, userId);
    await refreshCurrentSession(set, get);
    return match.id;
  },

  async previewLegacyMatchImport(payload) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    return repository.previewLegacyMatchImport(payload, userId);
  },

  async importLegacyMatches(payload) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const result = await repository.importLegacyMatches(payload, userId);
    await refreshCurrentSession(set, get);
    return result;
  },

  async createMatchDiaryEntry(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const entry = await repository.createMatchDiaryEntry(input, userId);
    await refreshCurrentSession(set, get);
    return entry.id;
  },

  async updateMatchDiaryEntry(entryId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateMatchDiaryEntry(entryId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async deleteMatchDiaryEntry(entryId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.deleteMatchDiaryEntry(entryId, userId);
    await refreshCurrentSession(set, get);
  },

  async submitMvpVote(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.submitMvpVote(input, userId);
    await refreshCurrentSession(set, get);
  },

  async submitPlayerRating(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.submitPlayerRating(input, userId);
    await refreshCurrentSession(set, get);
  },
}));

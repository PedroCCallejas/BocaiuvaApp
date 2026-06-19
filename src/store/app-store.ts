import { create } from 'zustand';
import Constants from 'expo-constants';

import { authService } from '@/services/auth';
import type { AuthSessionUser } from '@/services/auth';
import {
  clearCurrentUserPushToken,
  syncCurrentUserPushToken,
} from '@/services/notifications';
import {
  canCreateTeamFromOwnedTeamsCount,
  getOwnedTeamsCount,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
} from '@/lib/team';
import { TEAM_ACCESS_PERMISSION_MESSAGE } from '@/constants/access-notices';
import { isTeamStorageCleanupWarning } from '@/lib/team-deletion';
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
  UpdateMatchFieldPaymentInput,
  UpdateMatchDiaryEntryInput,
  UpdateRatingCriterionInput,
  UpdateTeamInput,
  UpdateAttendanceInput,
  UpdatePlayerInput,
} from '@/services/repository/types';
import type { JoinTeamPlayerLinkResolution } from '@/lib/player-linking';
import type {
  ImportLegacyMatchesResult,
  ImportedMatchPayloadItem,
  LegacyMatchImportPreview,
} from '@/types/match-import';
import type {
  AttendanceRecord,
  AttendanceStatus,
  PublicTeamProfile,
  PublicTeamSummary,
  Team,
} from '@/types/domain';
import {
  buildBootstrapRecoverySnapshot,
  extractRepositoryErrorCode,
  extractRepositoryErrorContext,
  extractRepositoryPartialSnapshot,
  isRepositoryPermissionDeniedError,
  resolveBootstrapAccessNotice,
} from '@/store/bootstrap-recovery';

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
  listPublicTeams: () => Promise<PublicTeamSummary[]>;
  getPublicTeamProfile: (teamId: string) => Promise<PublicTeamProfile | null>;
  createTeam: (input: CreateTeamInput) => Promise<Team>;
  updateTeam: (teamId: string, input: UpdateTeamInput) => Promise<void>;
  deleteTeamPermanently: (teamId: string) => Promise<{ storageCleanupWarning: boolean }>;
  regenerateTeamInviteCode: (teamId: string) => Promise<string>;
  createRatingCriterion: (input: CreateRatingCriterionInput) => Promise<void>;
  updateRatingCriterion: (criterionId: string, input: UpdateRatingCriterionInput) => Promise<void>;
  deleteRatingCriterion: (criterionId: string) => Promise<void>;
  setActiveTeam: (teamId: string) => Promise<void>;
  joinTeamWithInviteCode: (
    inviteCode: string,
  ) => Promise<{ alreadyMember: boolean; playerLink: JoinTeamPlayerLinkResolution }>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  createPlayer: (input: CreatePlayerInput) => Promise<string>;
  updatePlayer: (playerId: string, input: UpdatePlayerInput) => Promise<void>;
  unlinkPlayerAccount: (playerId: string) => Promise<void>;
  removePlayer: (playerId: string) => Promise<void>;
  reactivatePlayer: (playerId: string) => Promise<void>;
  createMatch: (input: CreateMatchInput) => Promise<string>;
  updateMatch: (matchId: string, input: UpdateMatchInput) => Promise<void>;
  updateMatchFieldPayment: (
    matchId: string,
    input: UpdateMatchFieldPaymentInput,
  ) => Promise<void>;
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
  deleteMatch: (matchId: string) => Promise<void>;
  setManualMvp: (matchId: string, playerId: string | null) => Promise<void>;
  adminSetMatchAttendance: (
    matchId: string,
    playerId: string,
    status: AttendanceStatus,
  ) => Promise<AttendanceRecord>;
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

function recoverFromPermissionDenied(
  set: StoreSet,
  get: StoreGet,
  sessionUser: AuthSessionUser | null,
  error: unknown,
  source: 'bootstrap' | 'refresh' | 'realtime' | 'auth-refresh' | 'auth-realtime',
) {
  if (!isRepositoryPermissionDeniedError(error)) {
    return false;
  }

  const currentUserId = resolveCurrentUserId(sessionUser);
  const errorContext = extractRepositoryErrorContext(error);
  const snapshot = buildBootstrapRecoverySnapshot(
    sessionUser,
    extractRepositoryPartialSnapshot(error),
  );
  const recoveredSnapshot = {
    ...snapshot,
    accessNotice: resolveBootstrapAccessNotice(error, snapshot),
  };
  const resolvedCurrentUserId = currentUserId ?? snapshot.users[0]?.id ?? null;

  resetRealtimeSubscription();
  applySnapshot(set, get, recoveredSnapshot, resolvedCurrentUserId);
  set({
    ready: true,
    backendMode: repository.getMode(),
    currentUserId: resolvedCurrentUserId,
    hasLiveSync: false,
    syncStatus: 'idle',
  });

  if (__DEV__) {
    console.warn(
      `[bootstrap] ${source} permission-denied fallback`,
      JSON.stringify(
        {
          code: extractRepositoryErrorCode(error),
          message: error instanceof Error ? error.message : 'Erro desconhecido.',
          context: errorContext,
          currentUserId: resolvedCurrentUserId,
          partialSnapshot: extractRepositoryPartialSnapshot(error) != null,
          teamAccessPermissionMessage:
            recoveredSnapshot.accessNotice === TEAM_ACCESS_PERMISSION_MESSAGE,
        },
        null,
        2,
      ),
    );
  }

  return true;
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
  } catch (error) {
    if (recoverFromPermissionDenied(set, get, sessionUser, error, 'refresh')) {
      return;
    }

    throw error;
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

    if (recoverFromPermissionDenied(set, get, sessionUser, error, 'realtime')) {
      return;
    }

    throw error;
  }
}

function ensureAuthSubscription(set: StoreSet, get: StoreGet) {
  if (authSubscription) {
    return;
  }

  authSubscription = authService.subscribe((sessionUser) => {
    void ensureRealtimeSubscription(set, get, sessionUser).catch((error) => {
      if (recoverFromPermissionDenied(set, get, sessionUser, error, 'auth-realtime')) {
        return;
      }

      if (__DEV__) {
        console.warn('[bootstrap] auth realtime sync failed.', error);
      }
    });
    void refreshSnapshot(set, get, sessionUser).catch((error) => {
      if (recoverFromPermissionDenied(set, get, sessionUser, error, 'auth-refresh')) {
        return;
      }

      if (__DEV__) {
        console.warn('[bootstrap] auth snapshot refresh failed.', error);
      }
    });
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
    let snapshot: AppSnapshot;

    try {
      snapshot = await repository.getInitialSnapshot();
    } catch (error) {
      if (recoverFromPermissionDenied(set, get, sessionUser, error, 'bootstrap')) {
        ensureAuthSubscription(set, get);
        return;
      }

      throw error;
    }

    applySnapshot(set, get, snapshot, currentUserId);
    set({
      ready: true,
      backendMode: repository.getMode(),
      currentUserId,
    });
    ensureAuthSubscription(set, get);
    try {
      await ensureRealtimeSubscription(set, get, sessionUser);
    } catch (error) {
      if (recoverFromPermissionDenied(set, get, sessionUser, error, 'realtime')) {
        return;
      }

      if (__DEV__) {
        console.warn('[bootstrap] failed to start realtime subscription.', error);
      }
      set({ hasLiveSync: false, syncStatus: 'idle' });
    }
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

  async listPublicTeams() {
    return repository.listPublicTeams(get().currentUserId);
  },

  async getPublicTeamProfile(teamId) {
    return repository.getPublicTeamProfile(teamId, get().currentUserId);
  },

  async createTeam(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const ownedTeamsCount = getOwnedTeamsCount(get().snapshot.teams, userId);
    if (!canCreateTeamFromOwnedTeamsCount(ownedTeamsCount)) {
      throw new Error(OWNED_TEAMS_LIMIT_REACHED_MESSAGE);
    }

    const team = await repository.createTeam(input, userId);
    await refreshCurrentSession(set, get);
    return team;
  },

  async updateTeam(teamId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    if (__DEV__) {
      console.log('[team-edit] store start', { teamId, userId });
    }
    await repository.updateTeam(teamId, input, userId);
    if (__DEV__) {
      console.log('[team-edit] store success', { teamId });
    }
    await refreshCurrentSession(set, get);
  },

  async deleteTeamPermanently(teamId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    try {
      await repository.deleteTeamPermanently(teamId, userId);
      await refreshCurrentSession(set, get);
      return { storageCleanupWarning: false };
    } catch (error) {
      if (isTeamStorageCleanupWarning(error)) {
        await refreshCurrentSession(set, get);
        return { storageCleanupWarning: true };
      }

      throw error;
    }
  },

  async regenerateTeamInviteCode(teamId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const team = await repository.regenerateTeamInviteCode(teamId, userId);
    await refreshCurrentSession(set, get);
    return team.inviteCode;
  },

  async createRatingCriterion(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.createRatingCriterion(input, userId);
    await refreshCurrentSession(set, get);
  },

  async updateRatingCriterion(criterionId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.updateRatingCriterion(criterionId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async deleteRatingCriterion(criterionId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.deleteRatingCriterion(criterionId, userId);
    await refreshCurrentSession(set, get);
  },

  async setActiveTeam(teamId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.setActiveTeam(teamId, userId);
    await refreshCurrentSession(set, get);
  },

  async joinTeamWithInviteCode(inviteCode) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const result = await repository.joinTeamWithInviteCode(inviteCode, userId);
    await refreshCurrentSession(set, get);
    return {
      alreadyMember: result.alreadyMember,
      playerLink: result.playerLink,
    };
  },

  async markNotificationAsRead(notificationId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.markNotificationAsRead(notificationId, userId);
    await refreshCurrentSession(set, get);
  },

  async markAllNotificationsAsRead() {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.markAllNotificationsAsRead(userId);
    await refreshCurrentSession(set, get);
  },

  async createPlayer(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const player = await repository.createPlayer(input, userId);
    await refreshCurrentSession(set, get);
    return player.id;
  },

  async updatePlayer(playerId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.updatePlayer(playerId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async unlinkPlayerAccount(playerId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.unlinkPlayerAccount(playerId, userId);
    await refreshCurrentSession(set, get);
  },

  async removePlayer(playerId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.removePlayer(playerId, userId);
    await refreshCurrentSession(set, get);
  },

  async reactivatePlayer(playerId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.reactivatePlayer(playerId, userId);
    await refreshCurrentSession(set, get);
  },

  async createMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const match = await repository.createMatch(input, userId);
    await refreshCurrentSession(set, get);
    return match.id;
  },

  async updateMatch(matchId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.updateMatch(matchId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async updateMatchFieldPayment(matchId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.updateMatchFieldPayment(matchId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async setAttendance(input) {
    const userId = get().currentUserId;
    const debugAttendance = __DEV__ || process.env.EXPO_PUBLIC_DEBUG_ATTENDANCE === 'true';
    if (debugAttendance) {
      console.log('[attendance-store] setAttendance start', {
        uid: userId,
        matchId: input.matchId,
        playerId: input.playerId,
        status: input.status,
      });
    }
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    try {
      await repository.updateAttendance(input, userId);
      if (debugAttendance) {
        console.log('[attendance-store] setAttendance success', {
          uid: userId,
          matchId: input.matchId,
          playerId: input.playerId,
          status: input.status,
        });
      }
    } catch (error) {
      if (debugAttendance) {
        console.error('[attendance-store] setAttendance failed', {
          uid: userId,
          matchId: input.matchId,
          playerId: input.playerId,
          status: input.status,
          error: error instanceof Error
            ? { message: error.message, code: (error as unknown as Record<string, unknown>).code, stack: error.stack }
            : error,
        });
      }
      throw error;
    }
    await refreshCurrentSession(set, get);
  },

  async saveLineup(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const savedLineup = await repository.saveLineup(input, userId);

    const prev = get();
    set({
      snapshot: {
        ...prev.snapshot,
        lineups: [
          ...prev.snapshot.lineups.filter((l) => l.matchId !== input.matchId),
          savedLineup,
        ],
      },
    });

    await refreshCurrentSession(set, get);
  },

  async finishMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.finishMatch(input, userId);
    await refreshCurrentSession(set, get);
  },

  async registerFinishedMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const match = await repository.registerFinishedMatch(input, userId);
    await refreshCurrentSession(set, get);
    return match.id;
  },

  async previewLegacyMatchImport(payload) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    return repository.previewLegacyMatchImport(payload, userId);
  },

  async importLegacyMatches(payload) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const result = await repository.importLegacyMatches(payload, userId);
    await refreshCurrentSession(set, get);
    return result;
  },

  async createMatchDiaryEntry(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const entry = await repository.createMatchDiaryEntry(input, userId);
    await refreshCurrentSession(set, get);
    return entry.id;
  },

  async updateMatchDiaryEntry(entryId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.updateMatchDiaryEntry(entryId, input, userId);
    await refreshCurrentSession(set, get);
  },

  async deleteMatchDiaryEntry(entryId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.deleteMatchDiaryEntry(entryId, userId);
    await refreshCurrentSession(set, get);
  },

  async submitMvpVote(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.submitMvpVote(input, userId);
    await refreshCurrentSession(set, get);
  },

  async submitPlayerRating(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.submitPlayerRating(input, userId);
    await refreshCurrentSession(set, get);
  },

  async deleteMatch(matchId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    if (__DEV__) {
      console.log('[match-delete] button pressed', { matchId, userId });
    }

    await repository.deleteMatch(matchId, userId);
    await refreshCurrentSession(set, get);
  },

  async setManualMvp(matchId, playerId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    await repository.setManualMvp(matchId, playerId, userId);
    await refreshCurrentSession(set, get);
  },

  async adminSetMatchAttendance(matchId, playerId, status) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessão expirada.');
    }

    const record = await repository.adminSetMatchAttendance(matchId, playerId, status, userId);
    await refreshCurrentSession(set, get);
    return record;
  },
}));


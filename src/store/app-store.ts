import { create } from 'zustand';

import { authService } from '@/services/auth';
import type { AuthSessionUser } from '@/services/auth';
import { repository } from '@/services/repository';
import { emptySnapshot } from '@/services/repository/types';
import type {
  AppSnapshot,
  CreateMatchInput,
  CreatePlayerInput,
  CreateTeamInput,
  FinishMatchInput,
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
  SaveLineupInput,
  SubmitMvpVoteInput,
  SubmitPlayerRatingInput,
  UpdateMatchInput,
  UpdateTeamInput,
  UpdateAttendanceInput,
  UpdatePlayerInput,
} from '@/services/repository/types';

export interface AppState {
  ready: boolean;
  backendMode: 'mock' | 'firebase';
  currentUserId: string | null;
  snapshot: AppSnapshot;
  bootstrap: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  loginWithGoogle: (input: GoogleLoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  createTeam: (input: CreateTeamInput) => Promise<void>;
  updateTeam: (teamId: string, input: UpdateTeamInput) => Promise<void>;
  regenerateTeamInviteCode: (teamId: string) => Promise<string>;
  setActiveTeam: (teamId: string) => Promise<void>;
  joinTeamWithInviteCode: (inviteCode: string) => Promise<{ alreadyMember: boolean }>;
  createPlayer: (input: CreatePlayerInput) => Promise<string>;
  updatePlayer: (playerId: string, input: UpdatePlayerInput) => Promise<void>;
  createMatch: (input: CreateMatchInput) => Promise<string>;
  updateMatch: (matchId: string, input: UpdateMatchInput) => Promise<void>;
  setAttendance: (input: UpdateAttendanceInput) => Promise<void>;
  saveLineup: (input: SaveLineupInput) => Promise<void>;
  finishMatch: (input: FinishMatchInput) => Promise<void>;
  submitMvpVote: (input: SubmitMvpVoteInput) => Promise<void>;
  submitPlayerRating: (input: SubmitPlayerRatingInput) => Promise<void>;
}

let authSubscription: (() => void) | null = null;

function resolveCurrentUserId(sessionUser: AuthSessionUser | null) {
  return sessionUser?.authId ?? null;
}

async function refreshSnapshot(
  set: (partial: Partial<AppState>) => void,
  sessionUser: AuthSessionUser | null,
) {
  const currentUserId = resolveCurrentUserId(sessionUser);
  const snapshot = await repository.getSnapshot();
  set({ snapshot, currentUserId });
}

function ensureAuthSubscription(set: (partial: Partial<AppState>) => void) {
  if (authSubscription) {
    return;
  }

  authSubscription = authService.subscribe((sessionUser) => {
    void refreshSnapshot(set, sessionUser);
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  backendMode: repository.getMode(),
  currentUserId: null,
  snapshot: emptySnapshot,

  async bootstrap() {
    if (get().ready) {
      ensureAuthSubscription(set);
      return;
    }

    const sessionUser = await authService.restoreSession();
    const currentUserId = resolveCurrentUserId(sessionUser);
    const snapshot = await repository.getInitialSnapshot();
    set({
      snapshot,
      ready: true,
      backendMode: repository.getMode(),
      currentUserId,
    });
    ensureAuthSubscription(set);
  },

  async login(input) {
    await repository.login(input);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async loginWithGoogle(input) {
    await repository.loginWithGoogle(input);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async register(input) {
    await repository.register(input);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async resetPassword(email) {
    await repository.resetPassword(email);
  },

  async logout() {
    await authService.logout();
    await refreshSnapshot(set, null);
  },

  async refreshAccess() {
    const sessionUser = authService.getCurrentUser() ?? (await authService.restoreSession());
    await refreshSnapshot(set, sessionUser);
  },

  async createTeam(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.createTeam(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async updateTeam(teamId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateTeam(teamId, input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async regenerateTeamInviteCode(teamId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const team = await repository.regenerateTeamInviteCode(teamId, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
    return team.inviteCode;
  },

  async setActiveTeam(teamId) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.setActiveTeam(teamId, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async joinTeamWithInviteCode(inviteCode) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const result = await repository.joinTeamWithInviteCode(inviteCode, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
    return { alreadyMember: result.alreadyMember };
  },

  async createPlayer(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const player = await repository.createPlayer(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
    return player.id;
  },

  async updatePlayer(playerId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updatePlayer(playerId, input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async createMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    const match = await repository.createMatch(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
    return match.id;
  },

  async updateMatch(matchId, input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateMatch(matchId, input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async setAttendance(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.updateAttendance(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async saveLineup(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.saveLineup(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async finishMatch(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.finishMatch(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async submitMvpVote(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.submitMvpVote(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },

  async submitPlayerRating(input) {
    const userId = get().currentUserId;
    if (!userId) {
      throw new Error('Sessao expirada.');
    }

    await repository.submitPlayerRating(input, userId);
    await refreshSnapshot(set, authService.getCurrentUser());
  },
}));

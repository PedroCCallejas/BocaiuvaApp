import {
  mockRepository,
  resetMockRepositorySession,
} from '@/services/repository/mock-repository';
import type {
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
} from '@/services/repository/types';
import type { User } from '@/types/domain';

import { createAuthError } from './errors';
import type { AuthService, AuthSessionUser } from './types';

function toSessionUser(user: User): AuthSessionUser {
  return {
    authId: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
  };
}

class MockAuthService implements AuthService {
  private currentUser: AuthSessionUser | null = null;

  private listeners = new Set<(user: AuthSessionUser | null) => void>();

  getMode() {
    return 'mock' as const;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async restoreSession() {
    return this.currentUser;
  }

  subscribe(listener: (user: AuthSessionUser | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async login(input: LoginInput) {
    const user = await mockRepository.login(input);
    this.currentUser = toSessionUser(user);
    this.emit();
    return this.currentUser;
  }

  async loginWithGoogle(_input: GoogleLoginInput): Promise<AuthSessionUser> {
    throw createAuthError('Esse acesso nao esta disponivel nesta demonstracao.');
  }

  async register(input: RegisterInput) {
    const user = await mockRepository.register(input);
    this.currentUser = toSessionUser(user);
    this.emit();
    return this.currentUser;
  }

  async resetPassword(email: string) {
    await mockRepository.resetPassword(email.trim());
  }

  async logout() {
    this.currentUser = null;
    resetMockRepositorySession();
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.currentUser);
    }
  }
}

export const mockAuthService = new MockAuthService();

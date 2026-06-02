import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';

import {
  auth,
  firebaseConfigError,
  firebaseEnabled,
} from '@/config/firebase/client';
import { normalizeEmail } from '@/lib/player-linking';
import type {
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
} from '@/services/repository/types';

import { createAuthError, toFriendlyAuthError } from './errors';
import type { AuthService, AuthSessionUser } from './types';

function getFallbackDisplayName(email: string) {
  return email.split('@')[0]?.trim() || 'Usuário';
}

function toSessionUser(user: FirebaseUser | null): AuthSessionUser | null {
  if (!user?.email) {
    return null;
  }

  return {
    authId: user.uid,
    email: user.email,
    displayName: user.displayName?.trim() || getFallbackDisplayName(user.email),
    avatarUrl: user.photoURL ?? null,
  };
}

function requireFirebaseAuth() {
  if (!firebaseEnabled || !auth) {
    throw createAuthError(
      firebaseConfigError ??
        'A conta conectada ainda não está pronta para uso.',
      'auth/configuration-error',
    );
  }

  return auth;
}

class FirebaseAuthService implements AuthService {
  private currentUser: AuthSessionUser | null = null;

  getMode() {
    return 'firebase' as const;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async restoreSession() {
    if (!auth) {
      this.currentUser = null;
      return this.currentUser;
    }

    await auth.authStateReady();
    this.currentUser = toSessionUser(auth.currentUser);
    return this.currentUser;
  }

  subscribe(listener: (user: AuthSessionUser | null) => void) {
    if (!auth) {
      return () => undefined;
    }

    return onAuthStateChanged(auth, (user) => {
      this.currentUser = toSessionUser(user);
      listener(this.currentUser);
    });
  }

  async login(input: LoginInput) {
    const authInstance = requireFirebaseAuth();

    try {
      const credential = await signInWithEmailAndPassword(
        authInstance,
        normalizeEmail(input.email),
        input.password,
      );

      this.currentUser = toSessionUser(credential.user);

      if (!this.currentUser) {
        throw createAuthError('Não foi possível carregar a sessão da conta.');
      }

      return this.currentUser;
    } catch (error) {
      throw toFriendlyAuthError(error, 'Não foi possível entrar agora.');
    }
  }

  async loginWithGoogle(input: GoogleLoginInput) {
    const authInstance = requireFirebaseAuth();

    try {
      const credential = GoogleAuthProvider.credential(
        input.idToken,
        input.accessToken ?? undefined,
      );
      const session = await signInWithCredential(authInstance, credential);
      this.currentUser = toSessionUser(session.user);

      if (!this.currentUser) {
        throw createAuthError('Não foi possível concluir a entrada com Google.');
      }

      return this.currentUser;
    } catch (error) {
      throw toFriendlyAuthError(
        error,
        'Não foi possível concluir a entrada com Google.',
      );
    }
  }

  async register(input: RegisterInput) {
    const authInstance = requireFirebaseAuth();

    try {
      const credential = await createUserWithEmailAndPassword(
        authInstance,
        normalizeEmail(input.email),
        input.password,
      );

      const displayName = input.displayName.trim();

      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }

      this.currentUser = toSessionUser(authInstance.currentUser ?? credential.user);

      if (!this.currentUser) {
        throw createAuthError('Não foi possível carregar a conta recém-criada.');
      }

      return this.currentUser;
    } catch (error) {
      throw toFriendlyAuthError(error, 'Não foi possível criar a conta agora.');
    }
  }

  async resetPassword(email: string) {
    const authInstance = requireFirebaseAuth();

    try {
      await sendPasswordResetEmail(authInstance, normalizeEmail(email));
    } catch (error) {
      throw toFriendlyAuthError(
        error,
        'Não foi possível enviar o link de recuperação.',
      );
    }
  }

  async logout() {
    if (!auth) {
      this.currentUser = null;
      return;
    }

    try {
      await signOut(auth);
      this.currentUser = null;

      // Futuro: encaixar login social com Google aqui, sem misturar com email/senha.
    } catch (error) {
      throw toFriendlyAuthError(
        error,
        'Não foi possível sair da conta agora.',
      );
    }
  }
}

export const firebaseAuthService = new FirebaseAuthService();

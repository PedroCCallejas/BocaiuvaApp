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
import type {
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
} from '@/services/repository/types';

import { createAuthError, toFriendlyAuthError } from './errors';
import type { AuthService, AuthSessionUser } from './types';

function getFallbackDisplayName(email: string) {
  return email.split('@')[0]?.trim() || 'Usuario';
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
        'A conta conectada ainda nao esta pronta para uso.',
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
        input.email.trim(),
        input.password,
      );

      this.currentUser = toSessionUser(credential.user);

      if (!this.currentUser) {
        throw createAuthError('Nao foi possivel carregar a sessao da conta.');
      }

      return this.currentUser;
    } catch (error) {
      throw toFriendlyAuthError(error, 'Nao foi possivel entrar agora.');
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
        throw createAuthError('Nao foi possivel concluir a entrada com Google.');
      }

      return this.currentUser;
    } catch (error) {
      throw toFriendlyAuthError(
        error,
        'Nao foi possivel entrar com Google agora.',
      );
    }
  }

  async register(input: RegisterInput) {
    const authInstance = requireFirebaseAuth();

    try {
      const credential = await createUserWithEmailAndPassword(
        authInstance,
        input.email.trim(),
        input.password,
      );

      const displayName = input.displayName.trim();

      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }

      this.currentUser = toSessionUser(authInstance.currentUser ?? credential.user);

      if (!this.currentUser) {
        throw createAuthError('Nao foi possivel carregar a conta recem-criada.');
      }

      return this.currentUser;
    } catch (error) {
      throw toFriendlyAuthError(error, 'Nao foi possivel criar a conta agora.');
    }
  }

  async resetPassword(email: string) {
    const authInstance = requireFirebaseAuth();

    try {
      await sendPasswordResetEmail(authInstance, email.trim());
    } catch (error) {
      throw toFriendlyAuthError(
        error,
        'Nao foi possivel enviar o link de recuperacao.',
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
      throw toFriendlyAuthError(error, 'Nao foi possivel sair da conta agora.');
    }
  }
}

export const firebaseAuthService = new FirebaseAuthService();

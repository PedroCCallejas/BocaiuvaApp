import { isFirebaseAuthEnabled } from '@/config/firebase/client';

import { firebaseAuthService } from './firebase-auth-service';
import { mockAuthService } from './mock-auth-service';

export { createAuthError, toFriendlyAuthError } from './errors';
export type { AuthService, AuthSessionUser } from './types';

export const authService = isFirebaseAuthEnabled
  ? firebaseAuthService
  : mockAuthService;

export const isUsingFirebaseAuth = authService.getMode() === 'firebase';

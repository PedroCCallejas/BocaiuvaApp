import { firebaseConfigError, firebaseEnabled } from '@/config/firebase/client';

export function isGoogleSignInConfigured() {
  return firebaseEnabled;
}

export function getGoogleSignInSetupHint() {
  return firebaseEnabled
    ? null
    : firebaseConfigError ??
        'Defina as variáveis públicas do Firebase para liberar o login com Google na web.';
}

export function getGoogleAuthDebugInfo() {
  return {
    platform: 'web',
    webStrategy: 'firebase-popup',
    firebaseEnabled,
    firebaseConfigError,
    configured: firebaseEnabled,
  };
}

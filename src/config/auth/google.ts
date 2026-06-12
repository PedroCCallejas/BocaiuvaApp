import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { firebaseConfigError, firebaseEnabled } from '@/config/firebase/client';

const GOOGLE_PLACEHOLDER_CLIENT_ID = 'google-client-id-not-configured';
type GoogleAuthPlatform = 'android' | 'ios' | 'web';

const googleAuthEnv = {
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '',
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '',
};

function getGoogleAuthPlatform(): GoogleAuthPlatform {
  if (Platform.OS === 'android') {
    return 'android';
  }

  if (Platform.OS === 'ios') {
    return 'ios';
  }

  return 'web';
}

function getAppScheme() {
  const configuredScheme = Constants.expoConfig?.scheme;

  if (Array.isArray(configuredScheme)) {
    return configuredScheme.find(Boolean)?.trim() || 'appboca';
  }

  if (typeof configuredScheme === 'string' && configuredScheme.trim()) {
    return configuredScheme.trim();
  }

  return 'appboca';
}

function getPlatformClientId(platform = getGoogleAuthPlatform()) {
  switch (platform) {
    case 'android':
      return googleAuthEnv.androidClientId;
    case 'ios':
      return googleAuthEnv.iosClientId;
    case 'web':
    default:
      return googleAuthEnv.webClientId;
  }
}

function getPlatformClientIdEnvName(platform = getGoogleAuthPlatform()) {
  switch (platform) {
    case 'android':
      return 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID';
    case 'ios':
      return 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID';
    case 'web':
    default:
      return 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
  }
}

function getPlatformLabel(platform = getGoogleAuthPlatform()) {
  switch (platform) {
    case 'android':
      return 'Android';
    case 'ios':
      return 'iOS';
    case 'web':
    default:
      return 'web';
  }
}

export function isGoogleSignInConfigured() {
  if (getGoogleAuthPlatform() === 'web') {
    return firebaseEnabled;
  }

  return Boolean(getPlatformClientId());
}

export function getGoogleSignInSetupHint() {
  const platform = getGoogleAuthPlatform();

  if (platform === 'web') {
    return firebaseEnabled
      ? null
      : firebaseConfigError ??
          'Defina as variáveis públicas do Firebase para liberar o login com Google na web.';
  }

  const platformClientId = getPlatformClientId(platform);

  if (platformClientId) {
    return null;
  }

  return `Defina ${getPlatformClientIdEnvName(platform)} no .env para liberar o login com Google no ${getPlatformLabel(platform)}.`;
}

export function getGoogleRedirectUri() {
  const appScheme = getAppScheme();

  return makeRedirectUri({
    scheme: appScheme,
    native: `${appScheme}://auth`,
    path: 'auth',
  });
}

export function getGoogleAuthRequestConfig(loginHint?: string) {
  const platform = getGoogleAuthPlatform();
  const platformClientId = getPlatformClientId(platform) || GOOGLE_PLACEHOLDER_CLIENT_ID;

  return {
    clientId: platformClientId,
    androidClientId: googleAuthEnv.androidClientId || undefined,
    iosClientId: googleAuthEnv.iosClientId || undefined,
    webClientId: googleAuthEnv.webClientId || undefined,
    redirectUri: getGoogleRedirectUri(),
    loginHint,
    selectAccount: true,
    shouldAutoExchangeCode: Platform.OS !== 'web',
    scopes: ['openid', 'profile', 'email'],
  };
}

export function getGoogleAuthDebugInfo() {
  const platform = getGoogleAuthPlatform();
  const redirectUri = getGoogleRedirectUri();
  const platformClientId = getPlatformClientId(platform);

  return {
    platform,
    appOwnership: Constants.appOwnership ?? 'unknown',
    scheme: getAppScheme(),
    redirectUri,
    webStrategy: platform === 'web' ? 'firebase-popup' : 'expo-auth-session-id-token',
    clientIdUsed: platformClientId || GOOGLE_PLACEHOLDER_CLIENT_ID,
    missingClientIdEnv: platformClientId
      ? null
      : getPlatformClientIdEnvName(platform),
    firebaseEnabled,
    firebaseConfigError,
    hasAndroidClientId: Boolean(googleAuthEnv.androidClientId),
    hasIosClientId: Boolean(googleAuthEnv.iosClientId),
    hasWebClientId: Boolean(googleAuthEnv.webClientId),
    configured: platform === 'web' ? firebaseEnabled : Boolean(platformClientId),
  };
}

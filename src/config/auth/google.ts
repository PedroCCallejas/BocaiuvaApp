import { Platform } from 'react-native';

const GOOGLE_PLACEHOLDER_CLIENT_ID = 'google-client-id-not-configured';

const googleAuthEnv = {
  clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '',
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ?? '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '',
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '',
};

export function isGoogleSignInConfigured() {
  if (Platform.OS === 'android') {
    return Boolean(googleAuthEnv.androidClientId || googleAuthEnv.clientId);
  }

  if (Platform.OS === 'ios') {
    return Boolean(googleAuthEnv.iosClientId || googleAuthEnv.clientId);
  }

  return Boolean(googleAuthEnv.webClientId || googleAuthEnv.clientId);
}

export function getGoogleAuthRequestConfig(loginHint?: string) {
  const fallbackClientId =
    googleAuthEnv.clientId ||
    googleAuthEnv.androidClientId ||
    googleAuthEnv.iosClientId ||
    googleAuthEnv.webClientId ||
    GOOGLE_PLACEHOLDER_CLIENT_ID;

  return {
    clientId: fallbackClientId,
    androidClientId: googleAuthEnv.androidClientId || undefined,
    iosClientId: googleAuthEnv.iosClientId || undefined,
    webClientId: googleAuthEnv.webClientId || undefined,
    loginHint,
    selectAccount: true,
  };
}

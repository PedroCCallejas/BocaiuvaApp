import type { AuthSessionResult } from 'expo-auth-session';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

type GoogleAuthResponse = AuthSessionResult & {
  authentication?: {
    accessToken?: string | null;
    idToken?: string | null;
  };
  params?: Record<string, string>;
  error?: {
    message?: string;
  };
};

export interface ExtractedGoogleAuthTokens {
  idToken: string | null;
  accessToken: string | null;
  errorMessage: string | null;
  idTokenSource: 'authentication' | 'params' | null;
}

export function isExpoGoForGoogleAuth() {
  return Constants.appOwnership === 'expo';
}

export function getGoogleAuthRuntimeHint() {
  if (!isExpoGoForGoogleAuth()) {
    return null;
  }

  return 'Use um development build para testar Entrar com Google no Android ou iOS.';
}

export function extractGoogleAuthTokens(
  response: AuthSessionResult | null,
): ExtractedGoogleAuthTokens {
  if (!response || response.type !== 'success') {
    return {
      idToken: null,
      accessToken: null,
      errorMessage: null,
      idTokenSource: null,
    };
  }

  const authResponse = response as GoogleAuthResponse;
  const idTokenFromAuthentication = authResponse.authentication?.idToken ?? null;
  const idTokenFromParams = authResponse.params?.id_token ?? null;

  return {
    idToken: idTokenFromAuthentication ?? idTokenFromParams ?? null,
    accessToken:
      authResponse.authentication?.accessToken ??
      authResponse.params?.access_token ??
      null,
    errorMessage: authResponse.error?.message ?? null,
    idTokenSource: idTokenFromAuthentication
      ? 'authentication'
      : idTokenFromParams
        ? 'params'
        : null,
  };
}

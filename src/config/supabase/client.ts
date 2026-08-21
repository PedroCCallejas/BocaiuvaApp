import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { auth } from '@/config/firebase/client';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const rawSupabaseLegacyKey = process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim() ?? '';
const supabaseAnonKey = rawSupabaseAnonKey || rawSupabaseLegacyKey;
const isDevelopment = process.env.NODE_ENV !== 'production';

interface NormalizedSupabaseUrlResult {
  normalizedUrl: string;
  error: string | null;
  warnings: string[];
}

function normalizeSupabaseUrl(value: string): NormalizedSupabaseUrlResult {
  if (!value) {
    return {
      normalizedUrl: '',
      error: null,
      warnings: [],
    };
  }

  try {
    const parsedUrl = new URL(value);
    const trimmedPath = parsedUrl.pathname.replace(/\/+$/, '');
    const warnings: string[] = [];

    if (trimmedPath === '/rest/v1' || trimmedPath.startsWith('/rest/v1/')) {
      warnings.push(
        'EXPO_PUBLIC_SUPABASE_URL deve usar a URL raiz do projeto. O trecho /rest/v1 foi removido automaticamente.',
      );
    }

    if (trimmedPath === '/storage/v1' || trimmedPath.startsWith('/storage/v1/')) {
      warnings.push(
        'EXPO_PUBLIC_SUPABASE_URL deve usar a URL raiz do projeto. O trecho /storage/v1 foi removido automaticamente.',
      );
    }

    parsedUrl.pathname = '';
    parsedUrl.search = '';
    parsedUrl.hash = '';

    const normalizedUrl = parsedUrl.origin.replace(/\/+$/, '');
    const isValidSupabaseHost = parsedUrl.hostname.endsWith('.supabase.co');

    if (!isValidSupabaseHost) {
      return {
        normalizedUrl,
        error:
          'A URL do Supabase deve usar o dominio raiz do projeto, por exemplo https://PROJECT_REF.supabase.co.',
        warnings,
      };
    }

    return {
      normalizedUrl,
      error: null,
      warnings,
    };
  } catch {
    return {
      normalizedUrl: '',
      error:
        'A URL do Supabase esta invalida. Use o dominio raiz do projeto, por exemplo https://PROJECT_REF.supabase.co.',
      warnings: [],
    };
  }
}

const normalizedSupabaseUrlResult = normalizeSupabaseUrl(rawSupabaseUrl);

function previewSecret(value: string) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 6)}***`;
}

export const supabaseConfigSummary = {
  hasUrl: Boolean(rawSupabaseUrl),
  normalizedUrl: normalizedSupabaseUrlResult.normalizedUrl || null,
  hasAnonKey: Boolean(supabaseAnonKey),
  anonKeyPreview: previewSecret(supabaseAnonKey),
  keySource: rawSupabaseAnonKey
    ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
    : rawSupabaseLegacyKey
      ? 'EXPO_PUBLIC_SUPABASE_KEY'
      : null,
} as const;

if (isDevelopment && rawSupabaseUrl) {
  for (const warning of normalizedSupabaseUrlResult.warnings) {
    console.warn('[supabase] warning', warning);
  }

  if (normalizedSupabaseUrlResult.error) {
    console.error('[supabase] invalid-url', normalizedSupabaseUrlResult.error);
  }

  if (normalizedSupabaseUrlResult.normalizedUrl) {
    console.info('[supabase] normalized-url', normalizedSupabaseUrlResult.normalizedUrl);
  }
}

if (isDevelopment && !rawSupabaseAnonKey && rawSupabaseLegacyKey) {
  console.warn(
    '[supabase] using-legacy-key-env',
    'EXPO_PUBLIC_SUPABASE_KEY foi encontrado e sera usado por compatibilidade.',
  );
}

export const supabaseMissingConfigKeys = [
  !rawSupabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY/EXPO_PUBLIC_SUPABASE_KEY' : null,
].filter((value): value is string => Boolean(value));

export const supabaseConfigError =
  supabaseMissingConfigKeys.length > 0
    ? 'O upload de imagens ainda nao foi configurado. Preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY. Por compatibilidade, EXPO_PUBLIC_SUPABASE_KEY tambem e aceito.'
    : normalizedSupabaseUrlResult.error;

export const supabaseEnabled = supabaseConfigError === null;

/**
 * O login continua no Firebase. O Supabase valida este JWT como provedor de
 * terceiros e usa `sub`/`role` nas policies do Postgres e do Storage.
 */
let tokenRefreshedForUserId: string | null = null;

export async function getFirebaseAccessToken() {
  const currentUser = auth?.currentUser;

  if (!currentUser) {
    tokenRefreshedForUserId = null;
    return null;
  }

  // A primeira chamada da sessao precisa buscar claims novos. Isso evita que
  // um usuario ja logado continue como `anon` depois do backfill do claim.
  const forceRefresh = tokenRefreshedForUserId !== currentUser.uid;
  const token = await currentUser.getIdToken(forceRefresh);
  tokenRefreshedForUserId = currentUser.uid;
  return token;
}

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(normalizedSupabaseUrlResult.normalizedUrl, supabaseAnonKey, {
      accessToken: getFirebaseAccessToken,
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;

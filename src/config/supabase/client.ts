import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User as FirebaseUser } from 'firebase/auth';

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
    ? 'O Supabase ainda não foi configurado. Preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY. Por compatibilidade, EXPO_PUBLIC_SUPABASE_KEY também é aceito.'
    : normalizedSupabaseUrlResult.error;

export const supabaseEnabled = supabaseConfigError === null;

/**
 * O login continua no Firebase. O Supabase valida este JWT como provedor de
 * terceiros e usa `sub`/`role` nas policies do Postgres e do Storage.
 */
let tokenRefreshedForUserId: string | null = null;
let claimPreparationUserId: string | null = null;
let claimPreparationPromise: Promise<void> | null = null;

async function prepareFirebaseClaim(user: FirebaseUser, idToken: string) {
  if (!normalizedSupabaseUrlResult.normalizedUrl || !supabaseAnonKey) {
    throw new Error('A conexão com o banco não está configurada.');
  }

  if (claimPreparationPromise && claimPreparationUserId === user.uid) {
    await claimPreparationPromise;
    return;
  }

  claimPreparationUserId = user.uid;
  claimPreparationPromise = (async () => {
    const response = await fetch(
      `${normalizedSupabaseUrlResult.normalizedUrl}/functions/v1/preparar-conta`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      },
    );
    const body = (await response.json().catch(() => ({}))) as { erro?: string };

    if (!response.ok) {
      throw new Error(
        body.erro ?? 'Não foi possível preparar sua conta para acessar os times.',
      );
    }
  })();

  try {
    await claimPreparationPromise;
  } finally {
    claimPreparationPromise = null;
    claimPreparationUserId = null;
  }
}

export async function getFirebaseAccessToken() {
  if (!auth) {
    throw new Error('Autenticação indisponível.');
  }

  // `currentUser` e null nos primeiros instantes depois de carregar a pagina: o
  // Firebase restaura a sessao de forma assincrona. Ler o Postgres nessa janela
  // mandava a requisicao como anonima, e a RLS devolvia zero linhas **sem
  // erro** — a tela mostrava "0 jogos, 0 gols" como se fosse a verdade, e a
  // fatia guardava esse vazio em cache.
  await auth.authStateReady();

  const currentUser = auth.currentUser;

  if (!currentUser) {
    tokenRefreshedForUserId = null;

    // Falhar e melhor do que ir como anonimo. Sem sessao, a resposta seria uma
    // lista vazia indistinguivel de "o time nao tem nada" — e o erro silencioso
    // e sempre pior do que o barulhento: a fatia trata a falha, nao cacheia, e
    // tenta de novo.
    throw new Error('Sessão não disponível para acessar o banco.');
  }

  // A primeira chamada da sessao precisa buscar claims novos. Isso evita que
  // um usuario ja logado continue como `anon` depois do backfill do claim.
  const forceRefresh = tokenRefreshedForUserId !== currentUser.uid;
  let tokenResult = await currentUser.getIdTokenResult(forceRefresh);

  if (tokenResult.claims.role !== 'authenticated') {
    await prepareFirebaseClaim(currentUser, tokenResult.token);
    tokenResult = await currentUser.getIdTokenResult(true);

    if (tokenResult.claims.role !== 'authenticated') {
      throw new Error('Sua conta foi reconhecida, mas ainda não recebeu acesso aos times.');
    }
  }

  tokenRefreshedForUserId = currentUser.uid;
  return tokenResult.token;
}

const canCreateBrowserClient = typeof window !== 'undefined';

/**
 * Cliente autenticado pelo JWT do Firebase Auth.
 *
 * Ele só nasce no navegador. Criá-lo durante o export estático fazia o módulo
 * Realtime pedir um token antes de existir sessão e poluía o build com um erro
 * que não representava falha de produção.
 */
export const supabase: SupabaseClient | null = supabaseEnabled && canCreateBrowserClient
  ? createClient(normalizedSupabaseUrlResult.normalizedUrl, supabaseAnonKey, {
      accessToken: getFirebaseAccessToken,
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Cliente anônimo para a galeria pública e mídia publicada pelo time. */
export const supabasePublic: SupabaseClient | null = supabaseEnabled && canCreateBrowserClient
  ? createClient(normalizedSupabaseUrlResult.normalizedUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;

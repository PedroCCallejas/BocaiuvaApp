import { cert, getApps, initializeApp, type ServiceAccount } from 'npm:firebase-admin@13.10.0/app';
import { getAuth } from 'npm:firebase-admin@13.10.0/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function abrirFirebaseAuth() {
  const encodedServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64');

  if (!encodedServiceAccount) {
    throw new Error('Credencial do Firebase indisponível.');
  }

  const serviceAccountBytes = Uint8Array.from(
    atob(encodedServiceAccount),
    (character) => character.charCodeAt(0),
  );
  const rawServiceAccount = new TextDecoder().decode(serviceAccountBytes);
  const serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  return getAuth(app);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  const idToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!idToken) {
    return resposta({ erro: 'Autenticação obrigatória.' }, 401);
  }

  let etapa = 'inicializar-firebase';

  try {
    const firebaseAuth = abrirFirebaseAuth();
    etapa = 'validar-token';
    const decodedToken = await firebaseAuth.verifyIdToken(idToken, true);
    etapa = 'carregar-usuario';
    const user = await firebaseAuth.getUser(decodedToken.uid);
    const currentClaims = user.customClaims ?? {};
    const updated = currentClaims.role !== 'authenticated';

    if (updated) {
      etapa = 'atualizar-claims';
      await firebaseAuth.setCustomUserClaims(user.uid, {
        ...currentClaims,
        role: 'authenticated',
      });
    }

    return resposta({ ok: true, updated });
  } catch (error) {
    const codigo =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : error instanceof SyntaxError
          ? 'invalid-service-account-json'
          : 'unknown';

    console.error(
      '[preparar-conta] falhou',
      etapa,
      codigo,
      error instanceof Error ? error.message : 'Erro desconhecido.',
    );
    return resposta(
      {
        erro: 'Não foi possível validar sua conta agora.',
        etapa,
        codigo,
      },
      401,
    );
  }
});

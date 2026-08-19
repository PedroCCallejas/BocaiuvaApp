/**
 * Atribui o custom claim `role: 'authenticated'` aos usuários do Firebase.
 *
 * O Supabase lê o campo `role` do JWT para decidir qual papel do Postgres usar.
 * O JWT do Firebase não traz esse campo, então sem isto todo mundo chega como
 * `anon` — e as policies, que são `to authenticated`, recusam tudo.
 *
 * Não mexe em senha, e-mail, provedor nem sessão. Só acrescenta um campo ao
 * token. Quem já tem o claim é pulado, então rodar de novo é seguro.
 *
 * Uso:
 *   npm run auth:claim:dry      # mostra quem receberia, sem gravar
 *   npm run auth:claim          # grava
 *
 * Credenciais: mesma ordem dos outros scripts do projeto.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

const CAMINHO_PADRAO_CREDENCIAL = path.resolve(
  process.cwd(),
  'secrets',
  'bocaiuva-app-firebase-service-account.json',
);

const PAPEL = 'authenticated';
const PAGINA = 1000;

function log(mensagem: string, dados?: unknown) {
  if (dados === undefined) {
    console.log(`[claim] ${mensagem}`);
    return;
  }

  console.log(
    `[claim] ${mensagem}`,
    typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2),
  );
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }

  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

function lerOpcoes(argv: string[]) {
  let credentialsPath: string | null = null;
  let projectId: string | null = null;
  let dryRun = false;

  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];

    if (argumento === '--help' || argumento === '-h') {
      console.log(
        [
          'Uso: node --experimental-strip-types ./scripts/definir-claim-supabase.ts [opcoes]',
          '',
          '  --dry-run              mostra quem receberia o claim, sem gravar',
          '  --credentials <path>   service account do Firebase',
          '  --project-id <id>      projeto do Firebase',
        ].join('\n'),
      );
      process.exit(0);
    }

    if (argumento === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argumento === '--credentials') {
      credentialsPath = argv[indice + 1] ? path.resolve(argv[indice + 1]) : null;
      indice += 1;
      continue;
    }

    if (argumento.startsWith('--credentials=')) {
      credentialsPath = path.resolve(argumento.slice('--credentials='.length));
      continue;
    }

    if (argumento === '--project-id') {
      projectId = argv[indice + 1] ?? null;
      indice += 1;
      continue;
    }

    if (argumento.startsWith('--project-id=')) {
      projectId = argumento.slice('--project-id='.length);
    }
  }

  const caminhoDoAmbiente =
    credentialsPath ??
    textoOuNulo(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    textoOuNulo(process.env.GOOGLE_APPLICATION_CREDENTIALS);

  return {
    credentialsPath: caminhoDoAmbiente
      ? path.resolve(caminhoDoAmbiente)
      : existsSync(CAMINHO_PADRAO_CREDENCIAL)
        ? CAMINHO_PADRAO_CREDENCIAL
        : null,
    projectId:
      projectId ??
      textoOuNulo(process.env.FIREBASE_PROJECT_ID) ??
      textoOuNulo(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ??
      textoOuNulo(process.env.GCLOUD_PROJECT),
    dryRun,
  };
}

function abrirAuth(opcoes: ReturnType<typeof lerOpcoes>) {
  if (getApps().length > 0) {
    return getAuth(getApps()[0]);
  }

  if (opcoes.credentialsPath) {
    if (!existsSync(opcoes.credentialsPath)) {
      throw new Error(`Credencial nao encontrada em ${opcoes.credentialsPath}.`);
    }

    const conta = JSON.parse(readFileSync(opcoes.credentialsPath, 'utf8')) as ServiceAccount & {
      project_id?: string;
    };

    return getAuth(
      initializeApp({
        credential: cert(conta),
        projectId: opcoes.projectId ?? conta.project_id,
      }),
    );
  }

  return getAuth(
    initializeApp({
      credential: applicationDefault(),
      ...(opcoes.projectId ? { projectId: opcoes.projectId } : {}),
    }),
  );
}

function jaTemOPapel(usuario: UserRecord) {
  return (usuario.customClaims ?? {}).role === PAPEL;
}

async function main() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const auth = abrirAuth(opcoes);

  log(opcoes.dryRun ? 'simulacao: nada sera gravado' : 'gravando o claim');

  let proximaPagina: string | undefined;
  let total = 0;
  let jaTinham = 0;
  let atualizados = 0;
  const falhas: { uid: string; email: string | null; erro: string }[] = [];
  const pendentes: { uid: string; email: string | null }[] = [];

  do {
    const pagina = await auth.listUsers(PAGINA, proximaPagina);
    proximaPagina = pagina.pageToken;

    for (const usuario of pagina.users) {
      total += 1;

      if (jaTemOPapel(usuario)) {
        jaTinham += 1;
        continue;
      }

      pendentes.push({ uid: usuario.uid, email: usuario.email ?? null });

      if (opcoes.dryRun) {
        continue;
      }

      try {
        // `setCustomUserClaims` SUBSTITUI o objeto inteiro. Espalhar o que já
        // existe evita apagar claim de outra funcionalidade sem perceber —
        // o exemplo da documentação do Supabase sobrescreve.
        await auth.setCustomUserClaims(usuario.uid, {
          ...(usuario.customClaims ?? {}),
          role: PAPEL,
        });
        atualizados += 1;
      } catch (erro) {
        falhas.push({
          uid: usuario.uid,
          email: usuario.email ?? null,
          erro: erro instanceof Error ? erro.message : 'Erro desconhecido.',
        });
      }
    }
  } while (proximaPagina);

  log('resumo', {
    total,
    jaTinhamOClaim: jaTinham,
    precisavam: pendentes.length,
    atualizados: opcoes.dryRun ? 0 : atualizados,
    falhas: falhas.length,
  });

  if (opcoes.dryRun && pendentes.length > 0) {
    log('receberiam o claim', pendentes.slice(0, 30));
  }

  if (falhas.length > 0) {
    log('falharam', falhas);
    process.exit(1);
  }

  if (!opcoes.dryRun && atualizados > 0) {
    log(
      [
        'O claim so aparece no token depois que ele e renovado.',
        'O Firebase renova sozinho em ate 1 hora, ou na proxima vez que a',
        'pessoa abrir o app. Nao precisa pedir para ninguem sair e entrar.',
      ].join('\n'),
    );
  }
}

main().catch((erro) => {
  console.error('[claim] falhou', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});

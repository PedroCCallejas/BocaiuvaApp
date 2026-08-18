/**
 * Importação Firestore → Postgres (Supabase).
 *
 * Idempotente: como os ids continuam sendo os mesmos do Firestore, o `upsert`
 * por id faz reimportar ser seguro. Rode quantas vezes precisar.
 *
 * Grava com a service key, que ignora RLS — é importação de servidor, não ação
 * de usuário. Os triggers de coluna protegida saem da frente sozinhos quando não
 * há JWT de usuário na requisição.
 *
 * Uso:
 *   npm run migrar:postgres -- --dry-run
 *   npm run migrar:postgres -- --only=expenses,expense_categories
 *   npm run migrar:postgres
 *
 * Credenciais (mesma ordem dos outros scripts do projeto):
 *   1. --credentials <caminho>
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH
 *   3. GOOGLE_APPLICATION_CREDENTIALS
 *   4. secrets/bocaiuva-app-firebase-service-account.json
 *   5. Application Default Credentials
 *
 * Supabase: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 * A service key NUNCA entra no repositório nem em arquivo versionado.
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
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  DEFINICOES,
  ORDEM_DAS_TABELAS,
  resolverReferencias,
  type Linha,
  type NomeDaTabela,
} from '@/lib/migracao/mapear-postgres';

const CAMINHO_PADRAO_CREDENCIAL = path.resolve(
  process.cwd(),
  'secrets',
  'bocaiuva-app-firebase-service-account.json',
);

/** Lote pequeno de propósito: erro em lote grande esconde qual linha quebrou. */
const TAMANHO_DO_LOTE = 400;
const PAGINA_DE_LEITURA = 500;

interface Opcoes {
  credentialsPath: string | null;
  projectId: string | null;
  dryRun: boolean;
  somente: NomeDaTabela[] | null;
}

function log(mensagem: string, dados?: unknown) {
  if (dados === undefined) {
    console.log(`[migracao] ${mensagem}`);
    return;
  }

  console.log(
    `[migracao] ${mensagem}`,
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

function lerOpcoes(argv: string[]): Opcoes {
  let credentialsPath: string | null = null;
  let projectId: string | null = null;
  let dryRun = false;
  let somente: NomeDaTabela[] | null = null;

  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];

    if (argumento === '--help' || argumento === '-h') {
      console.log(
        [
          'Uso: node --experimental-strip-types ./scripts/migrar-para-postgres.ts [opcoes]',
          '',
          '  --dry-run              le e mapeia, mas nao grava nada',
          '  --only=a,b             importa apenas estas tabelas',
          '  --credentials <path>   service account do Firebase',
          '  --project-id <id>      projeto do Firebase',
          '',
          'Ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
          '',
          `Tabelas: ${ORDEM_DAS_TABELAS.join(', ')}`,
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
      continue;
    }

    if (argumento.startsWith('--only=')) {
      const pedidas = argumento
        .slice('--only='.length)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const invalidas = pedidas.filter(
        (item) => !(ORDEM_DAS_TABELAS as readonly string[]).includes(item),
      );

      if (invalidas.length > 0) {
        throw new Error(`Tabela desconhecida em --only: ${invalidas.join(', ')}`);
      }

      somente = pedidas as NomeDaTabela[];
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
    somente,
  };
}

function abrirFirestore(opcoes: Opcoes): Firestore {
  if (getApps().length > 0) {
    return getFirestore(getApps()[0]);
  }

  if (opcoes.credentialsPath) {
    if (!existsSync(opcoes.credentialsPath)) {
      throw new Error(`Credencial nao encontrada em ${opcoes.credentialsPath}.`);
    }

    const conta = JSON.parse(readFileSync(opcoes.credentialsPath, 'utf8')) as ServiceAccount & {
      project_id?: string;
    };

    return getFirestore(
      initializeApp({
        credential: cert(conta),
        projectId: opcoes.projectId ?? conta.project_id,
      }),
    );
  }

  return getFirestore(
    initializeApp({
      credential: applicationDefault(),
      ...(opcoes.projectId ? { projectId: opcoes.projectId } : {}),
    }),
  );
}

function abrirSupabase(): SupabaseClient {
  const url = textoOuNulo(process.env.SUPABASE_URL);
  const chave = textoOuNulo(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !chave) {
    throw new Error(
      'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de importar.',
    );
  }

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Lê a coleção em páginas para não carregar o histórico inteiro na memória. */
async function lerColecao(firestore: Firestore, colecao: string) {
  const documentos: (Record<string, unknown> & { id: string })[] = [];
  let ultimo: string | null = null;

  for (;;) {
    let consulta = firestore.collection(colecao).orderBy('__name__').limit(PAGINA_DE_LEITURA);

    if (ultimo) {
      consulta = consulta.startAfter(ultimo);
    }

    const pagina = await consulta.get();

    if (pagina.empty) {
      break;
    }

    for (const documento of pagina.docs) {
      documentos.push({ ...documento.data(), id: documento.id });
    }

    ultimo = pagina.docs[pagina.docs.length - 1].id;

    if (pagina.size < PAGINA_DE_LEITURA) {
      break;
    }
  }

  return documentos;
}

async function gravar(supabase: SupabaseClient, tabela: NomeDaTabela, linhas: Linha[]) {
  for (let inicio = 0; inicio < linhas.length; inicio += TAMANHO_DO_LOTE) {
    const lote = linhas.slice(inicio, inicio + TAMANHO_DO_LOTE);
    const { error } = await supabase.from(tabela).upsert(lote, { onConflict: 'id' });

    if (error) {
      throw new Error(
        `Falha ao gravar ${tabela} (linhas ${inicio}..${inicio + lote.length - 1}): ${error.message}`,
      );
    }
  }
}

async function main() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const referencia = new Date().toISOString();
  const firestore = abrirFirestore(opcoes);
  const supabase = opcoes.dryRun ? null : abrirSupabase();

  log(opcoes.dryRun ? 'modo simulacao: nada sera gravado' : 'importando de verdade');

  const idsConhecidos: Partial<Record<NomeDaTabela, Set<string>>> = {};
  const resumo: Record<string, unknown>[] = [];

  // A ordem importa: chave estrangeira exige que o alvo já exista.
  for (const tabela of ORDEM_DAS_TABELAS) {
    const definicao = DEFINICOES.find((item) => item.tabela === tabela);

    if (!definicao) {
      continue;
    }

    const documentos = await lerColecao(firestore, definicao.colecao);
    const mapeadas: Linha[] = [];
    let semMapeamento = 0;

    for (const documento of documentos) {
      const linha = definicao.mapear(documento, { referencia });

      if (linha) {
        mapeadas.push(linha);
        continue;
      }

      semMapeamento += 1;
    }

    const { aceitas, descartadas, ajustadas } = resolverReferencias(
      tabela,
      mapeadas,
      idsConhecidos,
    );

    // O conjunto é preenchido sempre, inclusive em simulação: as tabelas
    // seguintes precisam dele para validar as próprias referências.
    idsConhecidos[tabela] = new Set(aceitas.map((linha) => linha.id));

    const pular = opcoes.somente && !opcoes.somente.includes(tabela);

    if (!pular && supabase && aceitas.length > 0) {
      await gravar(supabase, tabela, aceitas);
    }

    resumo.push({
      tabela,
      lidos: documentos.length,
      gravados: pular ? 0 : aceitas.length,
      pulada: Boolean(pular),
      semMapeamento,
      descartadasPorReferencia: descartadas.length,
      camposZeradosPorReferencia: ajustadas.length,
    });

    log(
      `${tabela}: ${documentos.length} lidos, ${aceitas.length} prontos` +
        (pular ? ' (pulada por --only)' : ''),
    );

    if (semMapeamento > 0) {
      log(`  ${semMapeamento} documento(s) sem campo obrigatorio, fora da importacao`);
    }

    if (descartadas.length > 0) {
      log('  descartados por referencia pendurada', descartadas.slice(0, 10));
    }

    if (ajustadas.length > 0) {
      log('  campos opcionais zerados por referencia pendurada', ajustadas.slice(0, 10));
    }
  }

  log('resumo', resumo);
  log(opcoes.dryRun ? 'simulacao concluida' : 'importacao concluida');
}

main().catch((erro) => {
  console.error('[migracao] falhou', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});

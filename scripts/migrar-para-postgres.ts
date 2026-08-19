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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  CHAVE_DE_CONFLITO,
  DEFINICOES,
  ORDEM_DAS_TABELAS,
  dependenciasVazias,
  resolverReferencias,
  type Linha,
  type LinhaFilha,
  type NomeDaTabela,
  type NomeDaTabelaFilha,
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
  /** Grava o Firestore cru em JSON, além de seguir o fluxo normal. */
  salvarEm: string | null;
  /** Lê do JSON em vez do Firestore. Não gasta cota nenhuma. */
  lerDe: string | null;
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
  let salvarEm: string | null = null;
  let lerDe: string | null = null;

  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];

    if (argumento === '--help' || argumento === '-h') {
      console.log(
        [
          'Uso: node --experimental-strip-types ./scripts/migrar-para-postgres.ts [opcoes]',
          '',
          '  --dry-run              le e mapeia, mas nao grava nada',
          '  --salvar-em=pasta      grava o Firestore cru em JSON',
          '  --ler-de=pasta         le do JSON em vez do Firestore (sem cota)',
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

    if (argumento.startsWith('--salvar-em=')) {
      salvarEm = path.resolve(argumento.slice('--salvar-em='.length));
      continue;
    }

    if (argumento.startsWith('--ler-de=')) {
      lerDe = path.resolve(argumento.slice('--ler-de='.length));
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
    salvarEm,
    lerDe,
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

type Documento = Record<string, unknown> & { id: string };

/**
 * Firestore serializa `Timestamp` como classe. Em JSON ele vira
 * `{ _seconds, _nanoseconds }` — que o mapeador já sabe ler. Nada a converter
 * aqui: guardar cru é o ponto, para o arquivo ser fiel ao que estava no banco.
 */
function caminhoDaColecao(pasta: string, colecao: string) {
  return path.join(pasta, `${colecao}.json`);
}

function salvarColecao(pasta: string, colecao: string, documentos: Documento[]) {
  mkdirSync(pasta, { recursive: true });
  writeFileSync(
    caminhoDaColecao(pasta, colecao),
    JSON.stringify(documentos, null, 2),
    'utf8',
  );
}

function carregarColecao(pasta: string, colecao: string): Documento[] {
  const caminho = caminhoDaColecao(pasta, colecao);

  // Coleção ausente no dump é coleção vazia, não erro: nem todo time tem
  // temporada, resenha ou despesa.
  if (!existsSync(caminho)) {
    return [];
  }

  const conteudo = JSON.parse(readFileSync(caminho, 'utf8')) as unknown;

  if (!Array.isArray(conteudo)) {
    throw new Error(`${caminho} nao contem uma lista de documentos.`);
  }

  return conteudo as Documento[];
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

/**
 * Ids que já estão no Postgres.
 *
 * Usado para as tabelas puladas por `--only`. Sem isto, uma importação em
 * pedaços releria o Firestore inteiro em cada pedaço só para validar chave
 * estrangeira — e é exatamente a leitura do Firestore que está racionada.
 * Aqui a consulta é no Postgres, que não tem cota de leitura.
 */
async function lerIdsExistentes(supabase: SupabaseClient, tabela: NomeDaTabela) {
  const ids = new Set<string>();
  const passo = 1000;

  for (let inicio = 0; ; inicio += passo) {
    const { data, error } = await supabase
      .from(tabela)
      .select('id')
      .range(inicio, inicio + passo - 1);

    if (error) {
      throw new Error(`Falha ao ler ids de ${tabela} no Postgres: ${error.message}`);
    }

    for (const linha of data ?? []) {
      const id = textoOuNulo((linha as { id?: unknown }).id);

      if (id) {
        ids.add(id);
      }
    }

    if (!data || data.length < passo) {
      break;
    }
  }

  return ids;
}

function ehCotaEstourada(erro: unknown) {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(mensagem);
}

async function gravar(
  supabase: SupabaseClient,
  tabela: NomeDaTabela | NomeDaTabelaFilha,
  linhas: (Linha | LinhaFilha)[],
  chave = 'id',
) {
  for (let inicio = 0; inicio < linhas.length; inicio += TAMANHO_DO_LOTE) {
    const lote = linhas.slice(inicio, inicio + TAMANHO_DO_LOTE);
    const { error } = await supabase.from(tabela).upsert(lote, { onConflict: chave });

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

  // Lendo do disco não há Firestore para abrir — e nem credencial a exigir.
  const firestore = opcoes.lerDe ? null : abrirFirestore(opcoes);
  const supabase = opcoes.dryRun ? null : abrirSupabase();

  log(opcoes.dryRun ? 'modo simulacao: nada sera gravado' : 'importando de verdade');

  if (opcoes.lerDe) {
    log(`lendo do dump em ${opcoes.lerDe} (nao gasta cota)`);
  }

  if (opcoes.salvarEm) {
    log(`salvando o Firestore cru em ${opcoes.salvarEm}`);
  }

  const idsConhecidos: Partial<Record<NomeDaTabela, Set<string>>> = {};
  const resumo: Record<string, unknown>[] = [];
  // Cada documento lido aqui sai da mesma cota diária de 50 mil que o app usa.
  let lidosDoFirestore = 0;

  // A ordem importa: chave estrangeira exige que o alvo já exista.
  for (const tabela of ORDEM_DAS_TABELAS) {
    const definicao = DEFINICOES.find((item) => item.tabela === tabela);

    if (!definicao) {
      continue;
    }

    const pular = Boolean(opcoes.somente && !opcoes.somente.includes(tabela));

    // Tabela fora do `--only` não é lida do Firestore: os ids vêm do Postgres,
    // que é onde eles já estão depois do primeiro pedaço da importação.
    if (pular) {
      if (supabase) {
        idsConhecidos[tabela] = await lerIdsExistentes(supabase, tabela);
        log(`${tabela}: pulada, ${idsConhecidos[tabela]?.size ?? 0} ids vindos do Postgres`);
      } else {
        // Sem conjunto de ids, `resolverReferencias` não valida esta origem.
        log(`${tabela}: pulada, sem verificacao de referencia (simulacao)`);
      }

      resumo.push({ tabela, lidos: 0, gravados: 0, pulada: true });
      continue;
    }

    // Antes de gastar leitura do Firestore: os pais desta tabela existem?
    const pendentes = dependenciasVazias(tabela, idsConhecidos);

    if (pendentes.length > 0) {
      throw new Error(
        [
          `${tabela} depende de ${pendentes.join(', ')}, que esta(o) vazia(s) no Postgres.`,
          '',
          'Importar assim descartaria todas as linhas por referencia pendurada,',
          'sem erro nenhum. Importe primeiro:',
          `  npm run migrar:postgres -- --only=${pendentes.join(',')}`,
        ].join('\n'),
      );
    }

    const documentos = opcoes.lerDe
      ? carregarColecao(opcoes.lerDe, definicao.colecao)
      : await lerColecao(firestore!, definicao.colecao);

    // Salvar antes de mapear: o arquivo tem de ser fiel ao Firestore, não ao
    // que o mapeamento entendeu dele. Assim dá para reprocessar quando o
    // mapeamento mudar, sem voltar a gastar leitura.
    if (opcoes.salvarEm && !opcoes.lerDe) {
      salvarColecao(opcoes.salvarEm, definicao.colecao, documentos);
    }

    const mapeadas: Linha[] = [];
    const filhasPorTabela = new Map<NomeDaTabelaFilha, LinhaFilha[]>();
    let semMapeamento = 0;

    for (const documento of documentos) {
      const linha = definicao.mapear(documento, { referencia });

      if (!linha) {
        semMapeamento += 1;
        continue;
      }

      mapeadas.push(linha);

      // Derivado do mesmo documento: normalizar nao custa leitura a mais.
      for (const filha of definicao.filhas ?? []) {
        const atual = filhasPorTabela.get(filha.tabela) ?? [];
        atual.push(...filha.derivar(documento, { referencia }));
        filhasPorTabela.set(filha.tabela, atual);
      }
    }

    const { aceitas, descartadas, ajustadas } = resolverReferencias(
      tabela,
      mapeadas,
      idsConhecidos,
    );

    // O conjunto é preenchido sempre, inclusive em simulação: as tabelas
    // seguintes precisam dele para validar as próprias referências.
    idsConhecidos[tabela] = new Set(aceitas.map((linha) => linha.id));

    if (supabase && aceitas.length > 0) {
      await gravar(supabase, tabela, aceitas);
    }

    // Filha entra depois do pai — e so a que sobreviveu ao filtro dele, senao
    // a chave estrangeira recusaria a linha.
    const idsAceitos = new Set(aceitas.map((linha) => linha.id));
    const filhasGravadas: Record<string, number> = {};

    for (const filha of definicao.filhas ?? []) {
      const linhas = (filhasPorTabela.get(filha.tabela) ?? []).filter((linha) =>
        idsAceitos.has(String(linha[filha.colunaDoPai] ?? '')),
      );

      // Jogador apagado deixa cota orfa para tras.
      const comJogadorConhecido = linhas.filter((linha) => {
        const playerId = textoOuNulo(linha.player_id);
        const jogadores = idsConhecidos.players;
        return !playerId || !jogadores || jogadores.has(playerId);
      });

      filhasGravadas[filha.tabela] = comJogadorConhecido.length;

      if (supabase && comJogadorConhecido.length > 0) {
        await gravar(
          supabase,
          filha.tabela,
          comJogadorConhecido,
          CHAVE_DE_CONFLITO[filha.tabela],
        );
      }

      const orfas = linhas.length - comJogadorConhecido.length;

      if (orfas > 0) {
        log(`  ${filha.tabela}: ${orfas} linha(s) descartada(s) por jogador inexistente`);
      }
    }

    lidosDoFirestore += documentos.length;

    resumo.push({
      tabela,
      lidos: documentos.length,
      gravados: aceitas.length,
      pulada: false,
      semMapeamento,
      descartadasPorReferencia: descartadas.length,
      camposZeradosPorReferencia: ajustadas.length,
      ...(Object.keys(filhasGravadas).length > 0 ? { filhas: filhasGravadas } : {}),
    });

    log(`${tabela}: ${documentos.length} lidos, ${aceitas.length} prontos`);

    for (const [nome, total] of Object.entries(filhasGravadas)) {
      log(`  ${nome}: ${total} linha(s)`);
    }

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
  log(
    opcoes.lerDe
      ? `documentos lidos do dump: ${lidosDoFirestore} (nenhuma leitura do Firestore)`
      : `documentos lidos do Firestore nesta rodada: ${lidosDoFirestore}`,
  );

  if (opcoes.salvarEm && !opcoes.lerDe) {
    log(`dump salvo em ${opcoes.salvarEm}`);
    log('daqui para frente use --ler-de para nao gastar cota de novo');
  }

  log(opcoes.dryRun ? 'simulacao concluida' : 'importacao concluida');
}

main().catch((erro) => {
  if (ehCotaEstourada(erro)) {
    console.error(
      [
        '[migracao] a cota diaria de leitura do Firestore acabou.',
        '',
        'Nao e erro do script: importar exige ler o banco inteiro, e essa',
        'leitura sai da mesma cota de 50 mil/dia que o app usa.',
        '',
        'O que fazer:',
        '  1. A cota reseta a meia-noite do Pacifico (~4h da manha no Brasil).',
        '     Rodar nessa janela nao tira leitura de quem vai usar o app no dia.',
        '  2. Nessa janela, baixe o Firestore UMA vez:',
        '       npm run migrar:baixar',
        '     Depois disso, mapear e importar saem do arquivo e nao custam nada:',
        '       npm run migrar:postgres:dry -- --ler-de=dados-firestore',
        '       npm run migrar:postgres -- --ler-de=dados-firestore',
        '  3. Se ainda assim faltar cota, importe em pedacos:',
        '       npm run migrar:postgres -- --only=users,teams,players,team_members',
        '     Tabela fora do --only nao e lida do Firestore: os ids ja importados',
        '     sao consultados no Postgres, que nao tem cota.',
      ].join('\n'),
    );
    process.exit(2);
  }

  console.error('[migracao] falhou', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';

import { traduzirErroDoPostgres } from '@/services/repository/supabase/erros';
import {
  criarFatia,
  limparFatias,
  registrarEmissao,
} from '@/services/repository/supabase/fatias';
import type { AppSnapshot } from '@/services/repository/types';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

/**
 * Snapshot de mentira para os testes de fatia.
 *
 * O que importa aqui é se o valor sobrevive à composição, não o formato do
 * `AppSnapshot` — montar um completo só esconderia o que está sendo testado.
 */
function base(campos: Record<string, unknown>): AppSnapshot {
  return campos as unknown as AppSnapshot;
}

function lista(snapshot: AppSnapshot): string[] {
  return (snapshot as unknown as { lista: string[] }).lista;
}

const RPC = 'supabase/migrations/20260821180000_rpc_salvar_despesa.sql';
const RPC_CRIAR_TIME = 'supabase/migrations/20260825045940_rpc_criar_time.sql';
const MODULO = 'src/services/repository/supabase/financeiro.ts';

/**
 * Só o código, sem comentário.
 *
 * Este arquivo explica no comentário o que NÃO pode existir no código —
 * "`security definer` aqui viraria um buraco". Procurar no texto cru faria a
 * própria explicação reprovar a implementação correta.
 */
function apenasCodigoSql(fonte: string) {
  return fonte
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');
}

function apenasCodigoTs(fonte: string) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('//'))
    .join('\n');
}

export const supabaseFinanceiroTestCases: TestCase[] = [
  {
    name: 'violacao de RLS vira mensagem de permissao, nao codigo cru',
    run() {
      // `new row violates row-level security policy for table "expenses"` nao
      // diz nada para quem so queria lancar uma cerveja.
      const porCodigo = traduzirErroDoPostgres({ code: '42501', message: 'denied' }, 'padrao');
      assert.equal(porCodigo.code, 'permission-denied');
      assert.match(porCodigo.message, /não tem permissão/);

      // Nem sempre vem com codigo: em alguns caminhos so o texto chega.
      const porTexto = traduzirErroDoPostgres(
        { message: 'new row violates row-level security policy' },
        'padrao',
      );
      assert.equal(porTexto.code, 'permission-denied');
    },
  },
  {
    name: 'queda de rede nao vira erro de permissao',
    run() {
      // Mandar a pessoa "pedir acesso ao admin" quando o problema e o 4G dela
      // e pior do que nao dizer nada.
      const erro = traduzirErroDoPostgres({ message: 'fetch failed' }, 'padrao');

      assert.equal(erro.code, 'unavailable');
      assert.match(erro.message, /Sem conexão/);
    },
  },
  {
    name: 'a causa tecnica e preservada para o log',
    run() {
      const erro = traduzirErroDoPostgres(
        { code: '23503', message: 'violates foreign key', details: 'categoria sumiu' },
        'padrao',
      );

      assert.equal(erro.code, 'failed-precondition');
      assert.match(erro.causaTecnica ?? '', /violates foreign key/);
      assert.match(erro.causaTecnica ?? '', /categoria sumiu/);
    },
  },
  {
    name: 'erro desconhecido cai na mensagem padrao do chamador',
    run() {
      const erro = traduzirErroDoPostgres({ code: 'XX999', message: 'algo raro' }, 'Deu ruim.');

      assert.equal(erro.code, 'unknown');
      assert.equal(erro.message, 'Deu ruim.');
    },
  },
  {
    name: 'despesa e rateio entram na mesma transacao',
    run() {
      const rpc = fs.readFileSync(RPC, 'utf8');

      // Duas escritas soltas podiam deixar despesa sem cota, e o painel de
      // pendencias passaria a mentir sobre quem deve o que.
      assert.match(rpc, /insert into public\.expenses/);
      assert.match(rpc, /delete from public\.expense_shares/);
      assert.match(rpc, /insert into public\.expense_shares/);
    },
  },
  {
    name: 'a RPC nao ganha privilegio de quem a criou',
    run() {
      const rpc = apenasCodigoSql(fs.readFileSync(RPC, 'utf8'));

      // `security definer` aqui viraria um buraco por onde qualquer membro
      // gravaria despesa, contornando a RLS que restringe ao admin.
      assert.match(rpc, /security invoker/);
      assert.doesNotMatch(rpc, /security definer/);
    },
  },
  {
    name: 'despesa nao troca de time nem de autor no update',
    run() {
      const rpc = apenasCodigoSql(fs.readFileSync(RPC, 'utf8'));
      const doUpdate = rpc.slice(rpc.indexOf('on conflict (id) do update set'));
      const ateOReturning = doUpdate.slice(0, doUpdate.indexOf('returning'));

      // Deixar `team_id` no update abriria caminho para mover despesa entre
      // times — e a RLS do destino nem seria consultada.
      assert.doesNotMatch(ateOReturning, /team_id = excluded/);
      assert.doesNotMatch(ateOReturning, /created_by = excluded/);
    },
  },
  {
    name: 'a permissao mora na RLS, nao repetida no cliente',
    run() {
      const modulo = apenasCodigoTs(fs.readFileSync(MODULO, 'utf8'));

      // Uma checagem a mais aqui so criaria um segundo lugar para divergir da
      // policy — e foi assim que nasceram os bugs do Firestore.
      assert.doesNotMatch(modulo, /ensureTeamAdmin/);
      assert.doesNotMatch(modulo, /canManageTeam/);
    },
  },
  {
    name: 'apagar despesa e soft delete, o historico financeiro nao some',
    run() {
      const modulo = fs.readFileSync(MODULO, 'utf8');
      const bloco = modulo.slice(modulo.indexOf('export async function apagarDespesa'));

      assert.match(bloco.slice(0, 400), /deletedAt: agora\(\)/);
      assert.doesNotMatch(bloco.slice(0, 400), /\.delete\(\)/);
    },
  },
  {
    name: 'categoria e arquivada, nunca apagada',
    run() {
      const modulo = fs.readFileSync(MODULO, 'utf8');
      const bloco = modulo.slice(modulo.indexOf('export async function arquivarCategoria'));

      // Despesa antiga aponta para a categoria: apagar deixaria o historico
      // sem nome, e a FK recusaria de qualquer forma.
      assert.match(bloco.slice(0, 400), /archived_at: agora\(\)/);
      assert.doesNotMatch(bloco.slice(0, 400), /\.delete\(\)/);
    },
  },
  {
    name: 'o firebase-repository nao foi tocado para migrar um modulo',
    run() {
      const firebase = fs.readFileSync('src/services/repository/firebase-repository.ts', 'utf8');

      // Ele sustenta o app inteiro hoje. Mexer nele para migrar um modulo
      // colocaria os outros quinze em risco sem necessidade.
      assert.doesNotMatch(firebase, /supabase/i);
    },
  },
  {
    name: 'o modulo desligado devolve o repositorio base sem camada nenhuma',
    run() {
      const index = fs.readFileSync('src/services/repository/index.ts', 'utf8');
      const composicao = fs.readFileSync(
        'src/services/repository/supabase/composicao/index.ts',
        'utf8',
      );

      // Mock existe para desenvolver sem banco. Empilhar Supabase em cima
      // misturaria dado de mentira com dado real.
      assert.match(index, /shouldUseFirebase\s*\n?\s*\? comModulosNoSupabase/);
      assert.match(index, /: baseRepository/);

      // Nenhum modulo ligado devolve o objeto original, nao uma copia inerte.
      assert.match(composicao, /if \(ligados\.length === 0\) \{\s*\n\s*return base;/);
    },
  },
  {
    name: 'camada nao le do base um dado que ela mesma ou outra camada entrega',
    run() {
      // `base` e a pilha ABAIXO da camada atual. Ler dela um dado que uma fatia
      // entrega devolve o que o Firestore tem — e o Firestore parou de ler
      // justamente essas colecoes.
      //
      // Custou caro: `createMatch` lia `base.getSnapshot().players` e criou uma
      // partida sem NINGUEM convocado. O admin marcou 14 pessoas na mao e quem
      // ele esqueceu nao apareceu nem como pendente. `submitPlayerRating` lia
      // `ratingCriteria` e gravava a nota com o snapshot de criterios vazio.
      //
      // Enquanto o Firestore ainda entregava tudo, os dois funcionavam por
      // acidente.
      const donoDaFatia = [
        'players',
        'matches',
        'attendance',
        'lineups',
        'matchStats',
        'mvpVotes',
        'playerRatings',
        'ratingCriteria',
        'matchDiaryEntries',
        'expenses',
        'expenseCategories',
      ];

      const acusados: string[] = [];

      for (const nome of ['financeiro', 'resenhas', 'partidas', 'avaliacoes', 'elenco']) {
        const caminho = `src/services/repository/supabase/composicao/${nome}.ts`;
        const fonte = apenasCodigoTs(fs.readFileSync(caminho, 'utf8'));

        // Cada trecho que sai de um `base.getSnapshot()` ate o proximo, para
        // saber quais campos foram lidos daquela chamada.
        const trechos = fonte.split('base.getSnapshot()').slice(1);

        for (const trecho of trechos) {
          const janela = trecho.slice(0, 500);

          for (const campo of donoDaFatia) {
            if (new RegExp(`snapshot\\.${campo}\\b`).test(janela)) {
              acusados.push(`${nome}.ts lê snapshot.${campo} do base`);
            }
          }
        }
      }

      assert.deepEqual(
        acusados,
        [],
        'leia da fatia ou do banco: o base não enxerga o que o Postgres entrega',
      );
    },
  },
  {
    name: 'sem sessao a leitura falha, em vez de voltar vazia como se fosse verdade',
    run() {
      const cliente = apenasCodigoTs(
        fs.readFileSync('src/config/supabase/client.ts', 'utf8'),
      );

      // `auth.currentUser` e null nos primeiros instantes depois de carregar a
      // pagina — o Firebase restaura a sessao de forma assincrona. Ler o
      // Postgres nessa janela ia como anonimo, e a RLS devolvia zero linhas SEM
      // erro: a tela mostrava "0 jogos, 0 gols" como se fosse a verdade, e a
      // fatia guardava esse vazio.
      assert.match(cliente, /await auth\.authStateReady\(\)/);

      // E se mesmo assim nao houver sessao, falhar e melhor do que ir anonimo:
      // lista vazia por falta de token e indistinguivel de time sem dados.
      const bloco = cliente.slice(cliente.indexOf('export async function getFirebaseAccessToken'));
      assert.match(bloco.slice(0, 900), /if \(!currentUser\) \{[\s\S]*?throw new Error/);
    },
  },
  {
    name: 'fatia que falhou tenta de novo sozinha',
    async run() {
      limparFatias();

      let deveFalhar = true;
      let leituras = 0;

      const fatia = criarFatia({
        nome: 'instavel',
        vazio: [] as string[],
        ler: async () => {
          leituras += 1;
          if (deveFalhar) throw new Error('sem sessao');
          return ['chegou'];
        },
        aplicar: (snapshot, valor) => ({ ...snapshot, lista: valor }),
      });

      await fatia.obter();
      assert.equal(leituras, 1, 'a primeira leitura precisa acontecer');
      assert.equal(fatia.estaVazia(), true, 'falha nao vira cache');

      // Sem retentativa, a tela ficava parada em zero ate alguem recarregar a
      // pagina: nada mais chamava a fatia. Uma queda de rede de dois segundos
      // virava "o time nao tem nenhum jogo" pelo resto da sessao.
      const fonte = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/fatias.ts', 'utf8'),
      );
      assert.match(fonte, /function agendarRetentativa/);
      assert.match(fonte, /setTimeout\(/);
      assert.match(fonte, /tentativasSeguidas >= MAXIMO_DE_RETENTATIVAS/);

      // E a recuperacao funciona de verdade quando a leitura volta.
      deveFalhar = false;
      assert.deepEqual(await fatia.recarregar(), ['chegou']);
      assert.equal(fatia.estaVazia(), false);
    },
  },
  {
    name: 'toda escrita diz em qual linha mexe',
    run() {
      // `definirTimeAtivo` fazia UPDATE sem filtro, confiando so na RLS para
      // limitar a linha. A policy realmente limita — mas o Supabase carrega a
      // extensao `safeupdate` na conexao do PostgREST, e ela recusa UPDATE sem
      // WHERE antes de a RLS entrar. Trocar de time simplesmente falhava.
      //
      // Fora isso, escrita sem filtro e perigosa por natureza: se um dia uma
      // policy for afrouxada, o update pega a tabela inteira.
      const semFiltro: string[] = [];

      for (const nome of ['elenco', 'avaliacoes', 'partidas', 'financeiro', 'resenhas']) {
        const caminho = `src/services/repository/supabase/${nome}.ts`;
        const linhas = fs.readFileSync(caminho, 'utf8').split('\n');

        linhas.forEach((linha, indice) => {
          if (!/\.(update|delete)\(/.test(linha)) {
            return;
          }

          // Janela ate o fim do statement: a cadeia de metodos ocupa varias
          // linhas e o filtro pode vir depois do `update`.
          let janela = '';

          for (let i = indice; i < Math.min(linhas.length, indice + 14); i += 1) {
            janela += `${linhas[i]}\n`;
            if (/;\s*$/.test(linhas[i])) break;
          }

          if (!/\.eq\(|\.in\(|\.match\(/.test(janela)) {
            semFiltro.push(`${nome}.ts:${indice + 1}`);
          }
        });
      }

      assert.deepEqual(
        semFiltro,
        [],
        'update/delete sem .eq/.in/.match: o PostgREST recusa e a RLS nem e consultada',
      );
    },
  },
  {
    name: 'reimportar nao pode apagar o que ja vive no Postgres',
    run() {
      // A trava existia desde o financeiro, mas ficou para tras: quatro modulos
      // migraram depois e ninguem voltou aqui. Rodar o importador teria
      // sobrescrito partida, presenca, nota e elenco com a versao congelada do
      // Firestore — apagando tudo que foi gravado desde a virada.
      //
      // Por isso o teste nao pergunta "esta na lista?", e sim "alguem decidiu
      // sobre esta tabela?". Tabela nova obriga uma escolha explicita.
      const fonte = fs.readFileSync('src/lib/migracao/mapear-postgres.ts', 'utf8');

      const ordem = fonte.slice(
        fonte.indexOf('export const ORDEM_DAS_TABELAS'),
        fonte.indexOf('export const TABELAS_FILHAS'),
      );
      const tabelas = [...ordem.matchAll(/'([a-z_]+)',/g)].map((achado) => achado[1]);

      const protegidas = fonte.slice(
        fonte.indexOf('export const TABELAS_DE_MODULO_JA_MIGRADO'),
        fonte.indexOf('// As tabelas filhas'),
      );

      /** Ainda no Firestore: reimportar nao apaga nada porque nada grava la. */
      const semModuloNoPostgres = ['seasons', 'notifications'];

      assert.equal(tabelas.length > 10, true, 'nao leu a ordem das tabelas');

      const desprotegidas = tabelas.filter(
        (tabela) =>
          !semModuloNoPostgres.includes(tabela) &&
          !new RegExp(`\\b${tabela}: '`).test(protegidas),
      );

      assert.deepEqual(
        desprotegidas.sort(),
        [],
        'tabela sem decisao: ou o modulo dela ja roda no Postgres (proteja) ou nao (documente)',
      );
    },
  },
  {
    name: 'o Firestore para de ler o que o Postgres ja entrega',
    run() {
      const composicao = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/composicao/index.ts', 'utf8'),
      );

      // Sem isso o app le os dois bancos inteiros: o Firestore entrega o dado,
      // a fatia joga fora e poe o Postgres no lugar. Leitura paga, dado
      // descartado — a mesma carga que motivou a migracao.
      assert.match(composicao, /ignorarColecoesDoFirestore\(/);

      const mapa = composicao.slice(
        composicao.indexOf('const COLECOES_POR_MODULO'),
        composicao.indexOf('export function comModulosNoSupabase'),
      );

      // Cada modulo migrado precisa dizer o que cobre, senao a leitura duplicada
      // volta calada para aquele pedaco.
      for (const [modulo, colecao] of [
        ['resenhas', 'matchDiaryEntries'],
        ['partidas', 'matches'],
        ['partidas', 'attendance'],
        ['avaliacoes', 'mvpVotes'],
        ['elenco', 'players'],
      ] as const) {
        assert.match(
          mapa,
          new RegExp(`${modulo}:[^\\]]*${colecao}`),
          `${modulo} nao declarou ${colecao}`,
        );
      }

      // A regra que nao pode ser quebrada: `users`, `teams` e `teamMembers` vem
      // do bootstrap e sao o que segura a tela em pe enquanto o Postgres
      // responde. Ignora-las devolve o "voce nao participa de nenhum time".
      for (const proibida of ['users', 'teams', 'teamMembers']) {
        assert.doesNotMatch(
          mapa,
          new RegExp(`'${proibida}'`),
          `${proibida} nunca pode sair do bootstrap do Firestore`,
        );
      }

      // O repositorio do Firestore sustenta o app inteiro e nao deve saber que
      // existe migracao: ele recebe uma lista de nomes, nada mais.
      const firebase = fs.readFileSync(
        'src/services/repository/firebase-repository.ts',
        'utf8',
      );
      assert.doesNotMatch(firebase, /supabase/i);
      assert.match(firebase, /colecaoIgnorada\(/);
    },
  },
  {
    name: 'leitura de colecao pagina, senao para nas primeiras mil linhas',
    run() {
      // O PostgREST corta toda resposta em 1000 linhas e nao avisa: nao ha
      // erro, so vem menos dado. Com `attendance` em 1659 linhas, o ranking
      // passou a somar 60% das presencas — o Alex caiu de 55 para 38 jogos.
      // Ninguem percebeu no codigo porque a conta continuava fechando entre si.
      const arquivos = ['partidas', 'avaliacoes', 'financeiro', 'resenhas'];

      for (const nome of arquivos) {
        const fonte = apenasCodigoTs(
          fs.readFileSync(`src/services/repository/supabase/${nome}.ts`, 'utf8'),
        );

        // Toda leitura de colecao inteira (`select('*')` com `eq` de time, sem
        // `maybeSingle`) precisa passar pelo paginador.
        const blocos = fonte.split('await Promise.all').join('\n');
        const temLeituraDeColecao = /\.select\('\*'\)[\s\S]{0,200}?\.eq\('team_id'/.test(blocos);

        if (temLeituraDeColecao) {
          assert.match(
            fonte,
            /todasAsLinhas\(/,
            `${nome}.ts le colecao inteira sem paginar`,
          );
        }
      }

      const paginacao = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/paginacao.ts', 'utf8'),
      );

      // O laco precisa avancar de pagina e parar na primeira incompleta. Sem a
      // parada, gira para sempre; sem o avanco, le a mesma pagina sempre.
      assert.match(paginacao, /pagina \* TAMANHO_DA_PAGINA/);
      assert.match(paginacao, /lote\.length < TAMANHO_DA_PAGINA/);

      // Paginar sem ordem estavel e pior do que nao paginar: o Postgres nao
      // garante a mesma ordem entre paginas, entao a mesma linha pode vir duas
      // vezes enquanto outra nunca aparece.
      const partidas = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/partidas.ts', 'utf8'),
      );
      // Recorte por janela em vez de regex balanceada: a consulta e uma cadeia
      // de metodos com parenteses aninhados, e casar isso com regex da falso
      // negativo — foi o que aconteceu na primeira versao deste teste.
      const paginadas = partidas
        .split('todasAsLinhas((de, ate) =>')
        .slice(1)
        .map((trecho) => trecho.slice(0, 400));

      assert.equal(paginadas.length > 0, true, 'nenhuma consulta paginada encontrada');

      for (const corpo of paginadas) {
        assert.match(corpo, /\.range\(de, ate\)/, 'consulta paginada precisa usar o intervalo');
        assert.match(corpo, /\.order\(/, 'consulta paginada precisa de ordenacao estavel');
      }
    },
  },
  {
    name: 'nenhum metodo do contrato grava no banco errado sem estar na lista',
    run() {
      // Este teste existe porque a mesma falha aconteceu tres vezes: o metodo
      // continua no Firestore, a tela ja le do Postgres, e a acao parece nao
      // fazer nada. Foi assim com o perfil da conta, com criar time e com o
      // pagamento do campo — este ultimo era o dinheiro do jogo.
      const contrato = fs.readFileSync('src/services/repository/types.ts', 'utf8');
      const metodos = new Set(
        [...contrato.matchAll(/^ {2}([a-zA-Z]+)[(<]/gm)].map((achado) => achado[1]),
      );

      const cobertos = new Set(
        ['financeiro', 'resenhas', 'partidas', 'avaliacoes', 'elenco', 'index']
          .flatMap((modulo) => [
            ...fs
              .readFileSync(`src/services/repository/supabase/composicao/${modulo}.ts`, 'utf8')
              .matchAll(/^ {4}async ([a-zA-Z]+)\(/gm),
          ])
          .map((achado) => achado[1]),
      );

      // O teste so vale se estiver mesmo lendo os dois lados.
      assert.equal(metodos.size > 40, true, 'nao leu o contrato');
      assert.equal(cobertos.size > 20, true, 'nao leu as camadas');

      /**
       * Fica no Firestore de propósito.
       *
       * Mexer nesta lista é uma decisão, não um detalhe: tirar um nome daqui
       * sem escrever a versão Postgres devolve o bug de gravar no banco errado.
       */
      const combinados = new Set([
        // Autenticacao, nao dado do time.
        'getMode',
        'login',
        'loginWithGoogle',
        'register',
        'resetPassword',
        // O modulo `notificacoes` nao esta ligado: seguem no Firestore,
        // coerentes com a leitura.
        'markNotificationAsRead',
        'markAllNotificationsAsRead',
        // Projecao publica, so leitura. Fica parada no ultimo estado ate o
        // modulo publico migrar — nao corrompe nada, so envelhece.
        'listPublicTeams',
        'getPublicTeamProfile',
        // Opcional no contrato, tratado dentro de `comModulosNoSupabase`.
        'subscribeSnapshot',
      ]);

      const desgarrados = [...metodos].filter(
        (metodo) => !cobertos.has(metodo) && !combinados.has(metodo),
      );

      assert.deepEqual(
        desgarrados.sort(),
        [],
        'metodo do contrato sem versao Postgres e fora da lista de combinados',
      );
    },
  },
  {
    name: 'toda escrita do financeiro invalida o cache da leitura',
    run() {
      // Cada modulo tem seu arquivo desde que o quarto chegou.
      const repo = ['financeiro', 'resenhas', 'partidas', 'elenco']
        .map((modulo) =>
          apenasCodigoTs(
            fs.readFileSync(`src/services/repository/supabase/composicao/${modulo}.ts`, 'utf8'),
          ),
        )
        .join('\n');

      // Cache que nao recarrega mostra o valor antigo depois de salvar, e a
      // pessoa acha que o botao nao funcionou.
      // Metodo que delega para outro nao recarrega duas vezes: quem faz o
      // trabalho ja avisou a tela. `updateFinishedMatchStats` e assim.
      const blocos = repo.split(/\n    async /).slice(1);

      // Leitura avulsa nao tem cache para invalidar. Sao os metodos que a tela
      // chama para buscar um recorte fora do snapshot — `fetch*` e `list*`.
      const ehLeitura = (bloco: string) => /^(fetch|list|get)[A-Z]/.test(bloco);

      // Metodo que so recusa tambem nao grava. Sao os que ficaram de fora da
      // migracao de proposito (excluir time, importar jogos antigos) e recusam
      // em vez de gravar no banco errado.
      const soRecusa = (bloco: string) =>
        /^\s*[a-zA-Z]+\([^)]*\) \{\s*throw criarErroDoRepositorio\(/.test(
          bloco.replace(/\n\s*\/\/[^\n]*/g, ''),
        );

      const gravam = blocos.filter(
        (bloco) =>
          !ehLeitura(bloco) &&
          !soRecusa(bloco) &&
          !/return await this\.[a-zA-Z]+\(/.test(bloco.slice(0, 400)),
      );
      const semRecarga = gravam.filter((bloco) => !bloco.includes('.recarregar()'));

      assert.equal(gravam.length > 0, true, 'nenhuma escrita encontrada');
      assert.deepEqual(
        semRecarga.map((bloco) => bloco.slice(0, bloco.indexOf('('))),
        [],
        'toda escrita precisa recarregar a fatia',
      );
    },
  },
  {
    name: 'o tempo real do Firestore continua entregando a fatia financeira',
    run() {
      const repo = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/composicao/index.ts', 'utf8'),
      );

      // Sem isso o app mostraria o financeiro vazio a cada atualizacao vinda
      // do outro banco.
      assert.match(repo, /comSnapshot\.subscribeSnapshot = async/);
      assert.match(repo, /handlers\.onSnapshot\(aplicarTodasAsFatias\(snapshot\)\)/);
    },
  },
  {
    name: 'escrita no Postgres avisa a tela sem esperar o Firestore',
    async run() {
      limparFatias();

      let doBanco = ['antes'];
      const fatia = criarFatia({
        nome: 'teste',
        vazio: [] as string[],
        ler: async () => doBanco,
        aplicar: (snapshot, valor) => ({ ...snapshot, lista: valor }),
      });

      const emitidos: unknown[] = [];
      registrarEmissao(base({ lista: ['firestore'] }), (s) => emitidos.push(lista(s)));

      await fatia.obter();
      doBanco = ['depois'];
      await fatia.recarregar();

      // So invalidar o cache deixava a fatia nula, e a proxima emissao do
      // Firestore saia VAZIA — as despesas sumiam da tela depois de marcar
      // alguem como quitado.
      assert.deepEqual(emitidos, [['depois']], 'a escrita precisa reemitir ja com o valor novo');
    },
  },
  {
    name: 'fatia que ainda nao carregou nao apaga o que veio do Firestore',
    run() {
      limparFatias();

      const fatia = criarFatia({
        nome: 'elenco-de-teste',
        vazio: [] as string[],
        ler: async () => ['do postgres'],
        aplicar: (snapshot, valor) => ({ ...snapshot, lista: valor }),
      });

      // O bug: `aplicar` usava `cache ?? vazio`, entao a primeira pintura
      // zerava `teamMembers` e o app concluia que a pessoa nao tinha time —
      // mandando o admin do Bocaiuva para a tela de codigo de convite.
      const antes = fatia.aplicar(base({ lista: ['veio do firestore'] }));
      assert.deepEqual(
        (antes as unknown as { lista: string[] }).lista,
        ['veio do firestore'],
        'antes de carregar, o snapshot precisa passar intacto',
      );
    },
  },
  {
    name: 'criar time nasce com dono, e a funcao nao vira porta dos fundos',
    run() {
      const sql = apenasCodigoSql(fs.readFileSync(RPC_CRIAR_TIME, 'utf8'));

      // Precisa ser `security definer`: `team_members_insert_admin` exige
      // `can_manage_team`, que ainda e falso na hora de criar o proprio
      // vinculo. Sem isso o time nasceria sem dono.
      assert.match(sql, /security definer/);

      // Mas `security definer` sem `search_path` fixo e sequestro de resolucao
      // de nome esperando acontecer.
      assert.match(sql, /set search_path to 'public', 'app', 'pg_temp'/);

      // Roda como dono da funcao, entao nao pode ficar aberta para quem nao
      // esta autenticado.
      assert.match(sql, /revoke all on function[\s\S]*from public, anon/);
      assert.match(sql, /grant execute on function[\s\S]*to authenticated/);

      // O limite de 2 times por conta existe no app, mas checagem que so vive
      // no cliente e sugestao, nao limite.
      assert.match(sql, />= 2/);
      assert.match(sql, /limite de 2 times/);

      // Time, ficha do dono e vinculo de admin na mesma transacao.
      assert.match(sql, /insert into public\.teams/);
      assert.match(sql, /insert into public\.players/);
      assert.match(sql, /insert into public\.team_members/);
      assert.match(sql, /array\['admin', 'player'\]/);
    },
  },
  {
    name: 'os criterios padrao vivem so no app, nunca duplicados no SQL',
    run() {
      const sql = apenasCodigoSql(fs.readFileSync(RPC_CRIAR_TIME, 'utf8'));

      // Copiar os rotulos para dentro da RPC criaria um segundo lugar para a
      // mesma verdade, e um deles ficaria para tras na primeira mudanca. Quem
      // cria os criterios e o app, depois, com o vinculo ja de pe.
      assert.doesNotMatch(sql, /insert into public\.rating_criteria/);

      const composicao = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/composicao/elenco.ts', 'utf8'),
      );
      assert.match(composicao, /createDefaultTeamRatingCriteria\(time\.id/);

      // E se os criterios falharem, o time continua existindo: da para
      // cria-los depois na tela de configuracao.
      const criarTime = composicao.slice(composicao.indexOf('async createTeam'));
      assert.match(criarTime.slice(0, 800), /try \{/);
    },
  },
  {
    name: 'conta sem linha no Postgres ganha perfil em vez de contexto vazio',
    run() {
      const elenco = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/elenco.ts', 'utf8'),
      );

      // No Firestore, `ensureCurrentUserDocumentAfterLogin` criava o documento
      // no primeiro acesso. Aqui nao existia equivalente: quem se cadastrasse
      // depois da importacao ficava sem linha, e sem linha o contexto volta
      // vazio — tela sem time e a RPC de convite recusando com "Crie o perfil
      // da conta antes de entrar no time".
      assert.match(elenco, /async function criarPerfilDaSessao/);
      assert.match(
        elenco,
        /usuario\.data \?\? \(await criarPerfilDaSessao\(\)\)/,
        'buscarContextoDaSessao precisa tentar criar o perfil antes de desistir',
      );

      // A policy `users_insert_self` so aceita 'player'. Mandar outra coisa
      // faria a insercao ser recusada justamente no primeiro acesso.
      assert.match(elenco, /app_role: 'player'/);

      // Duas abas abrindo juntas criam a mesma linha; a segunda tem que reler
      // em vez de estourar na cara de quem acabou de entrar.
      assert.match(elenco, /error\.code === '23505'/);
    },
  },
  {
    name: 'modulo fora do ar nao derruba o app nem vira cache',
    async run() {
      limparFatias();

      let deveFalhar = true;
      const fatia = criarFatia({
        nome: 'instavel',
        vazio: [] as string[],
        ler: async () => {
          if (deveFalhar) throw new Error('sem rede');
          return ['chegou'];
        },
        aplicar: (snapshot, valor) => ({ ...snapshot, lista: valor }),
      });

      // E uma aba so. Ficar sem ela e muito melhor do que a tela inicial nao
      // abrir — e vale para qualquer modulo, nao so o financeiro.
      assert.deepEqual(await fatia.obter(), [], 'falha devolve vazio em vez de estourar');

      // Mas a falha NAO pode virar cache: se virasse, o vazio passaria a
      // sobrescrever o Firestore como se fosse a verdade.
      assert.equal(fatia.estaVazia(), true, 'falha nao pode ser tratada como carregada');
      assert.deepEqual(
        (fatia.aplicar(base({ lista: ['firestore'] })) as unknown as { lista: string[] }).lista,
        ['firestore'],
        'depois de falhar, o dado do Firestore continua valendo',
      );

      deveFalhar = false;
      assert.deepEqual(await fatia.recarregar(), ['chegou'], 'a fatia se recupera sozinha');
    },
  },
  {
    name: 'o time ativo vem do banco, nao de estado guardado no modulo',
    run() {
      const repo = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/composicao/comum.ts', 'utf8'),
      );

      // Guardar o time numa variavel criaria uma segunda fonte da verdade que
      // sai de sincronia ao trocar de time — e o sintoma seria dado gravado no
      // time errado.
      assert.match(repo, /from\('users'\)\s*\n?\s*\.select\('active_team_id'\)/);
      assert.doesNotMatch(repo, /let timeAtivo/);
    },
  },
  {
    name: 'quitado de quem nao participa e descartado',
    run() {
      const modulo = fs.readFileSync(MODULO, 'utf8');

      // Seria divida inexistente marcada como paga.
      const ocorrencias = modulo.match(
        /\.filter\(\(playerId\) =>\s*\n?\s*participantes\.includes\(playerId\)/g,
      );

      assert.equal(
        (ocorrencias ?? []).length >= 2,
        true,
        'criar e atualizar precisam filtrar os quitados',
      );
    },
  },
];

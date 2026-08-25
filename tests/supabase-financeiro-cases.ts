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
const RPC_CRIAR_TIME = 'supabase/migrations/20260825120000_rpc_criar_time.sql';
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

      const gravam = blocos.filter(
        (bloco) =>
          !ehLeitura(bloco) &&
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

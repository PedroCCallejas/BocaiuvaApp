import assert from 'node:assert/strict';
import fs from 'node:fs';

import { traduzirErroDoPostgres } from '@/services/repository/supabase/erros';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const RPC = 'supabase/migrations/20260821180000_rpc_salvar_despesa.sql';
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
        'src/services/repository/supabase/composicao.ts',
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
      const repo = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/composicao.ts', 'utf8'),
      );

      // Cache que nao recarrega mostra o valor antigo depois de salvar, e a
      // pessoa acha que o botao nao funcionou.
      const escritas = repo.match(/async (create|update|delete|set)[A-Za-z]+\(/g) ?? [];
      const recargas = repo.match(/\.recarregar\(\);/g) ?? [];

      // 7 do financeiro + 3 de resenhas.
      assert.equal(escritas.length, 10, `esperava 10 escritas, achei ${escritas.length}`);
      assert.equal(
        recargas.length >= escritas.length,
        true,
        `${escritas.length} escritas para ${recargas.length} recargas`,
      );
    },
  },
  {
    name: 'o tempo real do Firestore continua entregando a fatia financeira',
    run() {
      const repo = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/composicao.ts', 'utf8'),
      );

      // Sem isso o app mostraria o financeiro vazio a cada atualizacao vinda
      // do outro banco.
      assert.match(repo, /comSnapshot\.subscribeSnapshot = async/);
      assert.match(repo, /handlers\.onSnapshot\(aplicarTodasAsFatias\(snapshot\)\)/);
    },
  },
  {
    name: 'escrita no Postgres avisa a tela sem esperar o Firestore',
    run() {
      const fatias = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/fatias.ts', 'utf8'),
      );

      // So invalidar o cache deixava a fatia nula, e a proxima emissao do
      // Firestore saia VAZIA — as despesas sumiam da tela depois de marcar
      // alguem como quitado.
      const recarregar = fatias.slice(fatias.indexOf('async recarregar()'));
      assert.match(recarregar.slice(0, 300), /cache = await lerComSeguranca\(\)/);
      assert.match(recarregar.slice(0, 300), /reemitir\(\)/);

      // O tempo real e do Firestore e ele nao sabe que o Postgres mudou; quem
      // escreveu precisa guardar para onde reemitir.
      assert.match(fatias, /ultimoSnapshotBase = snapshot;/);
      assert.match(fatias, /emitirParaOApp = emitir;/);
    },
  },
  {
    name: 'modulo fora do ar nao derruba o app inteiro',
    run() {
      const fatias = fs.readFileSync(
        'src/services/repository/supabase/fatias.ts',
        'utf8',
      );
      const leitura = fatias.slice(fatias.indexOf('async function lerComSeguranca'));

      // E uma aba so. Ficar sem ela e muito melhor do que a tela inicial nao
      // abrir — e vale para qualquer modulo, nao so o financeiro.
      assert.match(leitura.slice(0, 700), /catch \(erro\)/);
      assert.match(leitura.slice(0, 700), /return input\.vazio;/);
    },
  },
  {
    name: 'o time ativo vem do banco, nao de estado guardado no modulo',
    run() {
      const repo = apenasCodigoTs(
        fs.readFileSync('src/services/repository/supabase/composicao.ts', 'utf8'),
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
